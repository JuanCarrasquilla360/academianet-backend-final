const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

// Initialize clients
const dynamoClient = new DynamoDBClient();
const sesClient = new SESClient();

// Environment variables
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE || "Applications";

/**
 * Lambda function to handle application form submissions
 */
exports.handler = async (event, context) => {
  try {
    console.log("Processing application submission request");
    
    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    
    // Validate required fields
    const { nombre, apellido, email, telefono, programId, programName } = requestBody;
    
    if (!nombre || !apellido || !email || !telefono || !programId || !programName) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(),
        body: JSON.stringify({
          message: "Faltan campos obligatorios. Por favor, complete todos los campos requeridos: nombre, apellido, email, telefono, programId.",
          success: false
        })
      };
    }
    
    // Generate a unique ID for the application
    const applicationId = `app_${uuidv4()}`;
    const timestamp = new Date().toISOString();
    
    // Create application item
    const applicationItem = {
      id: applicationId,
      nombre: nombre,
      apellido: apellido,
      email: email.toLowerCase(),
      telefono: telefono,
      programId: programId,
      programName: programName,
      estado: "pendiente", // Initial status
      fechaCreacion: timestamp,
      fechaActualizacion: timestamp
    };
    
    // Store application in DynamoDB
    const params = {
      TableName: APPLICATIONS_TABLE,
      Item: marshall(applicationItem)
    };
    
    console.log("Storing application in DynamoDB:", JSON.stringify(params, null, 2));
    
    await dynamoClient.send(new PutItemCommand(params));

    // Send confirmation email
    const emailParams = {
      Source: 'juancarrasquilla135219@correo.itm.edu.co', // Replace with your verified SES email
      Destination: {
        ToAddresses: [email]
      },
      Message: {
        Subject: {
          Data: 'Confirmación de Solicitud - AcademiaNet'
        },
        Body: {
          Html: {
            Data: `
              <html>
                <body>
                  <h2>¡Gracias por tu interés en ${programName}!</h2>
                  <p>Hola ${nombre} ${apellido},</p>
                  <p>Hemos recibido tu solicitud para el programa ${programName}.</p>
                  <p>Tu número de solicitud es: <strong>${applicationId}</strong></p>
                  <p>Nos pondremos en contacto contigo pronto para continuar con el proceso.</p>
                  <p>Si tienes alguna pregunta, no dudes en contactarnos.</p>
                  <br>
                  <p>Saludos cordiales,</p>
                  <p>El equipo de AcademiaNet</p>
                </body>
              </html>
            `
          }
        }
      }
    };

    try {
      await sesClient.send(new SendEmailCommand(emailParams));
      console.log("Confirmation email sent successfully");
    } catch (emailError) {
      console.error("Error sending confirmation email:", emailError);
      // Continue with the response even if email fails
    }
    
    // Return success response
    return {
      statusCode: 201,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        message: "Solicitud registrada exitosamente. Nos comunicaremos contigo pronto.",
        applicationId: applicationId,
        success: true
      })
    };
  } catch (error) {
    console.error("Error processing application submission:", error);
    
    // Improved error handling with specific error types
    let statusCode = 500;
    let errorMessage = "Error interno al procesar la solicitud";
    
    if (error.name === "ValidationException") {
      statusCode = 400;
      errorMessage = "Error de validación en los datos enviados";
    } else if (error.name === "ResourceNotFoundException") {
      statusCode = 404;
      errorMessage = `La tabla ${APPLICATIONS_TABLE} no existe`;
    } else if (error.name === "ProvisionedThroughputExceededException") {
      statusCode = 429;
      errorMessage = "Capacidad de DynamoDB excedida, intente más tarde";
    }
    
    return {
      statusCode,
      headers: getCorsHeaders(),
      body: JSON.stringify({
        message: errorMessage,
        error: error.message || "Error desconocido",
        success: false,
        // Include request info for debugging
        time: new Date().toISOString(),
        requestId: event.requestContext?.requestId
      })
    };
  }
};

/**
 * Helper function to get CORS headers
 */
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "OPTIONS,POST",
    "Content-Type": "application/json"
  };
}