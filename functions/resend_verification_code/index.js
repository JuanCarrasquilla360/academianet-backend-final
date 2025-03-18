const { CognitoIdentityProviderClient, ResendConfirmationCodeCommand } = require('@aws-sdk/client-cognito-identity-provider');

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient();

// Environment variables
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;

/**
 * Lambda function to resend verification code to user's email
 */
exports.handler = async (event, context) => {
  try {
    console.log('Resend verification code event:', event);
    
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    
    // Extract username
    const { username } = body;
    
    // Validate required fields
    if (!username) {
      return formatResponse(400, { 
        message: 'El nombre de usuario es obligatorio'
      });
    }
    
    try {
      // Resend confirmation code
      await cognitoClient.send(new ResendConfirmationCodeCommand({
        ClientId: USER_POOL_CLIENT_ID,
        Username: username
      }));
      
      // Return success response
      return formatResponse(200, { 
        message: 'Código de verificación reenviado correctamente. Por favor revisa tu correo electrónico.'
      });
      
    } catch (error) {
      console.error('Error resending verification code:', error);
      
      // Handle specific error types
      if (error.name === 'UserNotFoundException') {
        return formatResponse(404, { 
          message: 'Usuario no encontrado'
        });
      } else if (error.name === 'LimitExceededException') {
        return formatResponse(429, { 
          message: 'Has excedido el límite de intentos. Por favor, intenta más tarde.'
        });
      } else if (error.name === 'InvalidParameterException') {
        return formatResponse(400, { 
          message: 'Parámetro inválido. Verifica que el nombre de usuario sea correcto.'
        });
      }
      
      return formatResponse(500, { 
        message: 'Error al reenviar el código de verificación', 
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
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Access-Control-Allow-Origin',
      'Access-Control-Allow-Credentials': 'true'
    }
  };
} 