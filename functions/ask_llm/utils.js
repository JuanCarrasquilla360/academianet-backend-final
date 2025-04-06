const {
    BedrockRuntimeClient,
    InvokeModelCommand,
    ConverseCommand,
  } = require('@aws-sdk/client-bedrock-runtime')
  const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
  const { DynamoDBClient, PutItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb')
  const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb')
  const { readFile } = require('fs/promises')
  
  const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' })
  const s3Client = new S3Client({ region: 'us-east-1' })
  const dynamoClient = new DynamoDBClient({ region: 'us-east-1' })
  
  // Configuración para almacenamiento de conversaciones
  const CONVERSATION_STORAGE_TYPE = process.env.CONVERSATION_STORAGE_TYPE || 'memory'; // 'memory', 's3', or 'dynamodb'
  const CONVERSATION_BUCKET = process.env.CONVERSATION_BUCKET || 'academianet-conversations';
  const CONVERSATION_TABLE = process.env.CONVERSATION_TABLE || 'Conversations';
  
  // Almacenamiento en memoria (solo para desarrollo/pruebas)
  const memoryStorage = {};
  
  /**
   * Read and process a local image file for Bedrock compatibility
   * @param {string} imagePath - Path to the local image file
   * @returns {Promise<{bytes: Buffer}>} Processed image data
   */
  async function readLocalImage(imagePath) {
    try {
      const imageBuffer = await readFile(imagePath)
      return {
        bytes: imageBuffer,
      }
    } catch (error) {
      throw new Error(`Failed to read local image: ${error.message}`)
    }
  }
  
  /**
   * Read and process an image from S3 for Bedrock compatibility
   * @param {string} bucket - S3 bucket name
   * @param {string} key - S3 object key
   * @returns {Promise<{bytes: Buffer}>} Processed image data
   */
  async function readS3Image(bucket, key) {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
  
      const response = await s3Client.send(command)
      const chunks = []
  
      for await (const chunk of response.Body) {
        chunks.push(chunk)
      }
  
      return {
        bytes: Buffer.concat(chunks),
      }
    } catch (error) {
      throw new Error(`Failed to read S3 image: ${error.message}`)
    }
  }
  
  /**
   * Guardar el historial de conversación
   * @param {string} conversationId - ID único de la conversación
   * @param {Array} messages - Array de mensajes de la conversación
   */
  async function saveConversationHistory(conversationId, messages) {
    try {
      if (CONVERSATION_STORAGE_TYPE === 'memory') {
        // Almacenamiento en memoria (solo para desarrollo)
        memoryStorage[conversationId] = messages;
        return;
      } else if (CONVERSATION_STORAGE_TYPE === 's3') {
        // Almacenamiento en S3
        const params = {
          Bucket: CONVERSATION_BUCKET,
          Key: `conversations/${conversationId}.json`,
          Body: JSON.stringify(messages),
          ContentType: 'application/json'
        };
        await s3Client.send(new PutObjectCommand(params));
      } else if (CONVERSATION_STORAGE_TYPE === 'dynamodb') {
        // Almacenamiento en DynamoDB
        const params = {
          TableName: CONVERSATION_TABLE,
          Item: marshall({
            id: conversationId,
            messages: messages,
            updatedAt: new Date().toISOString()
          })
        };
        await dynamoClient.send(new PutItemCommand(params));
      } else {
        // Por defecto, memoria
        memoryStorage[conversationId] = messages;
      }
    } catch (error) {
      console.error(`Error saving conversation history for ${conversationId}:`, error);
      throw error;
    }
  }
  
  /**
   * Recuperar el historial de conversación
   * @param {string} conversationId - ID único de la conversación
   * @returns {Promise<Array>} - Array de mensajes de la conversación
   */
  async function getConversationHistory(conversationId) {
    try {
      if (CONVERSATION_STORAGE_TYPE === 'memory') {
        // Recuperar de memoria
        return memoryStorage[conversationId] || [];
      } else if (CONVERSATION_STORAGE_TYPE === 's3') {
        // Recuperar de S3
        try {
          const params = {
            Bucket: CONVERSATION_BUCKET,
            Key: `conversations/${conversationId}.json`
          };
          const response = await s3Client.send(new GetObjectCommand(params));
          const chunks = [];
          for await (const chunk of response.Body) {
            chunks.push(chunk);
          }
          const data = Buffer.concat(chunks).toString();
          return JSON.parse(data);
        } catch (error) {
          if (error.name === 'NoSuchKey') {
            return [];
          }
          throw error;
        }
      } else if (CONVERSATION_STORAGE_TYPE === 'dynamodb') {
        // Recuperar de DynamoDB
        try {
          const params = {
            TableName: CONVERSATION_TABLE,
            Key: marshall({
              id: conversationId
            })
          };
          const response = await dynamoClient.send(new GetItemCommand(params));
          if (response.Item) {
            const item = unmarshall(response.Item);
            return item.messages || [];
          }
          return [];
        } catch (error) {
          if (error.name === 'ResourceNotFoundException') {
            return [];
          }
          throw error;
        }
      } else {
        // Por defecto, memoria
        return memoryStorage[conversationId] || [];
      }
    } catch (error) {
      console.error(`Error retrieving conversation history for ${conversationId}:`, error);
      return []; // Devolver array vacío en caso de error
    }
  }
  
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
  
  async function generateImage(prompt) {}
  
  async function generateVideo(prompt) {}
  
  
  
  
  async function getImageEmbedding(imageBuffer) {
    
    const input = {
      modelId: 'amazon.titan-embed-image-v1',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputImage: imageBuffer.toString('base64')
      })
    };
  
    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);
    
    // Parse the response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.embedding;
  }
  
  async function compareImages(image1Buffer, image2Buffer) {
    // Get embeddings for both images
    const embedding1 = await getImageEmbedding(image1Buffer);
    const embedding2 = await getImageEmbedding(image2Buffer);
    
    // Calculate cosine similarity between embeddings
    const similarity = cosineSimilarity(embedding1, embedding2);
    return similarity;
  }
  
  
  function cosineSimilarity(vectorA, vectorB) {
      if (vectorA.length !== vectorB.length) {
          throw new Error('Vectors must have the same length');
      }
  
      // Calculate dot product (A·B)
      const dotProduct = vectorA.reduce((sum, a, i) => sum + a * vectorB[i], 0);
      
      // Calculate magnitudes (||A|| and ||B||)
      const magnitudeA = Math.sqrt(vectorA.reduce((sum, a) => sum + a * a, 0));
      const magnitudeB = Math.sqrt(vectorB.reduce((sum, b) => sum + b * b, 0));
      
      // Avoid division by zero
      if (magnitudeA === 0 || magnitudeB === 0) {
          return 0;
      }
      
      // Return cosine similarity
      return dotProduct / (magnitudeA * magnitudeB);
  }
  
  
  
  
  module.exports = {
    readLocalImage,
    readS3Image,
    askLLM,
    generateImage,
    generateVideo,
    getImageEmbedding,
    compareImages,
    cosineSimilarity,
    saveConversationHistory,
    getConversationHistory
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