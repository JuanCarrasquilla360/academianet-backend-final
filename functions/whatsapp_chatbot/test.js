/**
 * Test script for testing the WhatsApp chatbot integration locally
 * Run with: node test.js
 */

const { handler } = require('./index');
const { askLLM } = require('./utils');

// Use the actual Twilio credentials from your environment
process.env.TWILIO_ACCOUNT_SID = 'AC04ab387adc4bff0b4c4f53e2c63e3e6e';
process.env.TWILIO_AUTH_TOKEN = 'bcf328f3d82012a351cd27262cde59c3';
process.env.TWILIO_PHONE_NUMBER = '+14155238886';

// Test the askLLM function directly
async function testAskLLM() {
  try {
    console.log('Testing askLLM function...');
    const systemPrompt = "Eres un asistente académico útil y breve.";
    const userMessage = "¿Qué carreras son buenas para alguien interesado en ciencias de la computación?";
    
    const conversation = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ];
    
    console.log('Sending message to Bedrock:', userMessage);
    const response = await askLLM(conversation, {
      temperature: 0.7,
      modelId: 'amazon.nova-lite-v1:0'
    });
    
    console.log('Response from Bedrock:');
    console.log('-'.repeat(50));
    console.log(response);
    console.log('-'.repeat(50));
    
    return response;
  } catch (error) {
    console.error('Error testing askLLM:', error);
  }
}

// Test the Lambda handler with a mock Twilio request
async function testHandler() {
  try {
    console.log('\nTesting Lambda handler with mock Twilio request...');
    
    // Mock Twilio WhatsApp request
    const mockEvent = {
      body: 'Body=¿Cuáles son los programas académicos disponibles en ingeniería?&From=whatsapp%3A%2B1234567890&To=whatsapp%3A%2B14155238886',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };
    
    console.log('Mock event:', mockEvent);
    console.log('Calling handler...');
    
    const response = await handler(mockEvent, {});
    console.log('Response from handler:');
    console.log('-'.repeat(50));
    console.log('Status code:', response.statusCode);
    console.log('Headers:', response.headers);
    console.log('Body:', response.body);
    console.log('-'.repeat(50));
    
    return response;
  } catch (error) {
    console.error('Error testing handler:', error);
  }
}

// Run tests
async function runTests() {
  await testAskLLM();
  await testHandler();
  console.log('\nTests completed!');
}

runTests(); 