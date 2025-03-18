const { DynamoDBClient, PutItemCommand, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { CognitoIdentityProviderClient, SignUpCommand, AdminConfirmSignUpCommand, AdminUpdateUserAttributesCommand, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { v4: uuidv4 } = require('uuid');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

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
    
    // Verificar si el correo electrónico ya está registrado
    try {
      const existingUsers = await cognitoClient.send(new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Filter: `email = "${correoElectronico}"`
      }));
      
      if (existingUsers.Users && existingUsers.Users.length > 0) {
        return formatResponse(409, {
          message: 'El correo electrónico ya está registrado. Por favor utiliza otro correo o recupera tu contraseña.'
        });
      }
    } catch (error) {
      console.error('Error verificando correo existente:', error);
      // Continuamos con el proceso aunque haya error en la verificación
    }
    
    // También verificamos si este correo ya está asociado a una institución en DynamoDB
    try {
      const existingInstitutions = await dynamoClient.send(new QueryCommand({
        TableName: INSTITUTIONS_TABLE,
        FilterExpression: 'adminEmail = :email',
        ExpressionAttributeValues: marshall({
          ':email': correoElectronico
        })
      }));
      
      if (existingInstitutions.Items && existingInstitutions.Items.length > 0) {
        return formatResponse(409, {
          message: 'Este correo electrónico ya está asociado a una institución registrada.'
        });
      }
    } catch (error) {
      console.error('Error verificando correo en DynamoDB:', error);
      // Continuamos con el proceso aunque haya error en la verificación
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
      
      // Ya no auto-confirmamos al usuario, debe verificar su correo
      // await cognitoClient.send(new AdminConfirmSignUpCommand({
      //   UserPoolId: USER_POOL_ID,
      //   Username: username
      // }));
      
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
        isVerified: false, // Inicialmente no verificada
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
      message: 'Registro exitoso. Se ha enviado un código de verificación a tu correo electrónico.', 
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