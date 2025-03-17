const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { CognitoIdentityProviderClient, SignUpCommand, AdminConfirmSignUpCommand, AdminUpdateUserAttributesCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { v4: uuidv4 } = require('uuid');
const { marshall } = require('@aws-sdk/util-dynamodb');

// Initialize clients
const dynamoClient = new DynamoDBClient();
const cognitoClient = new CognitoIdentityProviderClient();

// Environment variables
const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const INSTITUTIONS_TABLE = process.env.INSTITUTIONS_TABLE;

/**
 * Lambda function to handle institution registration
 */
exports.handler = async (event, context) => {
  try {
    console.log('Registration event:', event);
    
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    
    // Extract form data
    const { 
      nombre, 
      apellido, 
      nombreLegalInstitucion, 
      abreviacionNombre, 
      correoElectronico, 
      contrasena 
    } = body;
    
    // Validate required fields
    if (!nombre || !apellido || !nombreLegalInstitucion || !abreviacionNombre || !correoElectronico || !contrasena) {
      return formatResponse(400, { 
        message: 'Todos los campos son requeridos' 
      });
    }
    
    // Generate a unique ID for the institution
    const institutionId = uuidv4();
    
    // Create user in Cognito
    // Generate a username that is not an email format
    const uniqueId = uuidv4().substring(0, 8);
    const username = `user_${uniqueId}`;
    const fullName = `${nombre} ${apellido}`;
    
    try {
      // Register user in Cognito
      await cognitoClient.send(new SignUpCommand({
        ClientId: USER_POOL_CLIENT_ID,
        Username: username,
        Password: contrasena,
        UserAttributes: [
          {
            Name: 'email',
            Value: correoElectronico
          },
          {
            Name: 'name',
            Value: fullName
          },
          {
            Name: 'custom:institutionName',
            Value: abreviacionNombre
          },
          {
            Name: 'custom:institutionLegalName',
            Value: nombreLegalInstitucion
          },
          {
            Name: 'custom:instAbbr',
            Value: abreviacionNombre
          }
        ]
      }));
      
      // Auto-confirm the user (in a production environment, you might want to send a verification email)
      await cognitoClient.send(new AdminConfirmSignUpCommand({
        UserPoolId: USER_POOL_ID,
        Username: username
      }));
      
    } catch (error) {
      console.error('Error creating user in Cognito:', error);
      return formatResponse(500, { 
        message: 'Error al crear el usuario', 
        error: error.message 
      });
    }
    
    // Save institution data in DynamoDB
    try {
      const institutionItem = {
        id: institutionId,
        institutionName: abreviacionNombre,
        legalName: nombreLegalInstitucion,
        abbreviation: abreviacionNombre,
        adminEmail: correoElectronico,
        adminUsername: username,
        adminName: fullName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await dynamoClient.send(new PutItemCommand({
        TableName: INSTITUTIONS_TABLE,
        Item: marshall(institutionItem)
      }));
      
      // Update user with institution ID
      await cognitoClient.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        UserAttributes: [
          {
            Name: 'custom:institutionId',
            Value: institutionId
          }
        ]
      }));
      
    } catch (error) {
      console.error('Error saving institution data:', error);
      return formatResponse(500, { 
        message: 'Error al guardar los datos de la institución', 
        error: error.message 
      });
    }
    
    // Return success response
    return formatResponse(200, { 
      message: 'Registro exitoso', 
      institutionId,
      username,
      email: correoElectronico
    });
    
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