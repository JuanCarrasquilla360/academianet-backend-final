const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require('@aws-sdk/client-bedrock-runtime')

const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' })

/**
 * Send a prompt to Amazon Bedrock model with conversation history
 * @param {Array|string} input - The conversation history array or text prompt
 * @param {Object} options - Additional options
 * @returns {Promise<string>} The model's response
 */
async function askLLM(input, options = {}) {
  const {
    image,
    modelId = 'amazon.nova-lite-v1:0', // nova lite
    temperature = 0.7,
  } = options;

  try {
    // Determinar si input es un array de mensajes o un string
    let messages = [];

    if (Array.isArray(input)) {
      // Es un array de mensajes, usarlo directamente
      messages = [...input];
      console.log(`Using provided conversation history with ${messages.length} messages`);

      // Buscar si hay un mensaje de sistema y manejarlo correctamente
      let systemPrompt = "";
      if (messages.length > 0 && messages[0].role === "system") {
        // Extraer el mensaje del sistema
        systemPrompt = messages[0].content;
        // Eliminar el mensaje del sistema del array
        messages = messages.slice(1);
        console.log("Extracted system prompt, remaining messages:", messages.length);

        // Si hay algún mensaje del usuario, prepend el sistema a ese mensaje
        if (messages.length > 0 && messages[0].role === "user") {
          console.log("Prepending system prompt to first user message");
          const firstUserMessage = messages[0].content;
          messages[0].content = `${systemPrompt}\n\n${firstUserMessage}`;
        } else {
          // Si no hay mensajes del usuario, crear uno nuevo con el sistema
          console.log("No user messages found, creating one with system prompt");
          messages.unshift({
            role: "user",
            content: systemPrompt
          });
        }
      }
    } else if (typeof input === 'string') {
      // Es un string simple, crear un único mensaje de usuario
      console.log('Converting single string input to message format');
      messages = [
        { role: "user", content: input }
      ];
    } else {
      throw new Error('Input must be either a string or an array of message objects');
    }

    if (image) {
      console.log('Image provided, adding to the last user message');
      // Si hay imagen, buscar el último mensaje del usuario y agregarle la imagen
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          // Convertir el mensaje de texto a formato con imagen
          const userText = messages[i].content;
          messages[i].content = [
            { text: userText },
            {
              image: {
                format: 'jpeg',
                source: {
                  bytes: image.bytes,
                },
              },
            },
          ];
          break;
        }
      }
    }

    // Preparar la solicitud para Amazon Bedrock
    // Convertir mensajes al formato esperado por la API
    const apiMessages = messages.map(msg => {
      if (typeof msg.content === 'string') {
        return {
          role: msg.role,
          content: [{ text: msg.content }]
        };
      }
      return msg; // Ya está en el formato correcto
    });

    const conversationInput = {
      modelId,
      messages: apiMessages,
      inferenceConfiguration: {
        temperature,
        maxTokens: 2048
      },
    };

    console.log('Sending request to Amazon Bedrock with', apiMessages.length, 'messages');

    // Enviar la conversación a Amazon Bedrock
    const command = new ConverseCommand(conversationInput);
    const response = await bedrockClient.send(command);

    // Verificar y extraer la respuesta
    if (response.output?.message?.content?.[0]?.text) {
      return response.output.message.content[0].text;
    }

    throw new Error('Unexpected response format from Bedrock');
  } catch (error) {
    console.error('Error in askLLM:', error);
    throw new Error(`Failed to get response from Bedrock: ${error.message}`);
  }
}





module.exports = {
  askLLM,
}

// Example usage:
/*
const { askLLM, readLocalImage, readS3Image } = require('./askllm.js');

// Using with local image
const imageData = await readLocalImage('./path/to/image.jpg');
const response = await askLLM("What's in this image?", { image: imageData });

// Using with S3 image
const s3ImageData = await readS3Image('my-bucket', 'path/to/image.jpg');
const response = await askLLM("What's in this image?", { image: s3ImageData });

// Using without image
const response = await askLLM("Tell me a joke");
*/