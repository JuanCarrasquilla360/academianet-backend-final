const { askLLM } = require('./utils');
const { MessagingResponse } = require('twilio').twiml;

// Twilio credentials - These will be set as environment variables
// DO NOT hardcode actual credentials here
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// System prompt for academic guidance
const SYSTEM_PROMPT = `Eres un asistente virtual especializado en orientación académica para estudiantes en Colombia.
Tu objetivo es proporcionar información precisa sobre instituciones educativas, programas académicos, y opciones de carrera.
Responde de manera concisa, amable y en español. Si no conoces la respuesta, indícalo honestamente.
No inventes información que no conoces. Limita tus respuestas a temas educativos y académicos.`;

exports.handler = async (event, context) => {
  try {
    // Parse incoming request from Twilio
    const body = event.body ? new URLSearchParams(event.body) : new URLSearchParams();
    
    // Extract message content and metadata
    const incomingMessage = body.get('Body') || '';
    const from = body.get('From') || '';
    
    console.log(`Received message from ${from}: ${incomingMessage}`);
    
    if (!incomingMessage) {
      return createResponse('Lo siento, no pude entender tu mensaje. Por favor, intenta de nuevo.');
    }
    
    // Process the message with Bedrock
    const llmOptions = {
      temperature: 0.7,
      modelId: 'amazon.nova-lite-v1:0'  // Using Anthropic Claude
    };
    
    // Prepare conversation with system prompt and user message
    const conversation = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: incomingMessage }
    ];
    
    // Get response from Amazon Bedrock
    const response = await askLLM(conversation, llmOptions);
    
    // Return the response to Twilio
    return createResponse(response);
  } catch (error) {
    console.error('Error processing WhatsApp message:', error);
    return createResponse('Lo siento, tuvimos un problema procesando tu mensaje. Por favor, intenta de nuevo más tarde.');
  }
};

/**
 * Create a TwiML response for Twilio
 * @param {string} message - The message to send back to the user
 * @returns {Object} - API Gateway response object
 */
function createResponse(message) {
  const twiml = new MessagingResponse();
  twiml.message(message);
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/xml'
    },
    body: twiml.toString()
  };
} 