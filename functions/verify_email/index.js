const { DynamoDBClient, UpdateItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { CognitoIdentityProviderClient, ConfirmSignUpCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');

// Initialize clients
const dynamoClient = new DynamoDBClient();
const cognitoClient = new CognitoIdentityProviderClient();

// Environment variables
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const INSTITUTIONS_TABLE = process.env.INSTITUTIONS_TABLE;

/**
 * Lambda function to verify email with confirmation code and update institution verification status
 */
exports.handler = async (event, context) => {
  try {
    console.log('Verification event:', event);
    
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    
    // Extract data
    const { username, code } = body;
    
    // Validate required fields
    if (!username || !code) {
      return formatResponse(400, { 
        message: 'El nombre de usuario y el código de verificación son obligatorios' 
      });
    }
    
    try {
      // Verify the email with the confirmation code
      await cognitoClient.send(new ConfirmSignUpCommand({
        ClientId: USER_POOL_CLIENT_ID,
        Username: username,
        ConfirmationCode: code
      }));
      
      // Find the institution by admin username using QueryCommand on the GSI
      const queryResult = await dynamoClient.send(new QueryCommand({
        TableName: INSTITUTIONS_TABLE,
        IndexName: 'adminUsernameIndex',
        KeyConditionExpression: 'adminUsername = :username',
        ExpressionAttributeValues: marshall({
          ':username': username
        })
      }));
      
      if (!queryResult.Items || queryResult.Items.length === 0) {
        return formatResponse(404, {
          message: 'Institución no encontrada para el usuario especificado'
        });
      }
      
      const institution = unmarshall(queryResult.Items[0]);
      
      // Update the institution to mark it as verified
      await dynamoClient.send(new UpdateItemCommand({
        TableName: INSTITUTIONS_TABLE,
        Key: marshall({
          id: institution.id
        }),
        UpdateExpression: 'SET isVerified = :verified, updatedAt = :updatedAt',
        ExpressionAttributeValues: marshall({
          ':verified': true,
          ':updatedAt': new Date().toISOString()
        }),
        ReturnValues: 'ALL_NEW'
      }));
      
      // Return success response
      return formatResponse(200, { 
        message: 'Email verificado correctamente. Institución marcada como verificada.',
        institutionId: institution.id
      });
      
    } catch (error) {
      console.error('Error en verificación:', error);
      return formatResponse(500, { 
        message: 'Error en el proceso de verificación', 
        error: error.message 
      });
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
    return formatResponse(500, { 
      message: 'Error interno del servidor', 
      error: error.message 
    });
  }
};

/**
 * Format API Gateway response
 */
function formatResponse(statusCode, body) {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
    }
  };
} 