const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

// Initialize clients
const dynamoClient = new DynamoDBClient();

// Environment variables
const INSTITUTIONS_TABLE = process.env.INSTITUTIONS_TABLE;

/**
 * Lambda function to get all institutions
 */
exports.handler = async (event, context) => {
  try {
    console.log('Get institutions event:', event);
    
    // Get all institutions from DynamoDB
    const params = {
      TableName: INSTITUTIONS_TABLE
    };
    
    const result = await dynamoClient.send(new ScanCommand(params));
    
    // Transform DynamoDB items to regular JavaScript objects
    const institutions = result.Items.map(item => unmarshall(item));
    
    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        institutions,
        count: institutions.length
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS,POST,PUT',
      },
    };
    
  } catch (error) {
    console.error('Error getting institutions:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: 'Error al obtener las instituciones', 
        error: error.message 
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS,POST,PUT',
      },
    };
  }
};