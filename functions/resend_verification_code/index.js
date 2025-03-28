const { CognitoIdentityProviderClient, ResendConfirmationCodeCommand } = require("@aws-sdk/client-cognito-identity-provider");
const client = new CognitoIdentityProviderClient();

// Configuración del User Pool
const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;

/**
 * Formatea la respuesta para incluir los headers CORS
 */
function formatResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Credentials": "true"
    },
    body: JSON.stringify(body)
  };
}

/**
 * Manejador principal de la función Lambda
 */
exports.handler = async (event) => {
  console.log("Evento recibido:", JSON.stringify(event));

  // Para solicitudes OPTIONS (preflight CORS)
  if (event.httpMethod === "OPTIONS") {
    return formatResponse(200, {});
  }

  try {
    // Validar que el método sea POST
    if (event.httpMethod !== "POST") {
      return formatResponse(405, { error: "Método no permitido" });
    }

    // Extraer el body de la petición
    const requestBody = JSON.parse(event.body || "{}");
    const { username } = requestBody;

    // Validar parámetros
    if (!username) {
      return formatResponse(400, { error: "Se requiere un nombre de usuario" });
    }

    // Configurar comando para reenviar el código de confirmación
    const command = new ResendConfirmationCodeCommand({
      ClientId: CLIENT_ID,
      Username: username
    });

    // Ejecutar el comando
    const response = await client.send(command);
    console.log("Código de verificación reenviado:", response);

    // Devolver respuesta exitosa
    return formatResponse(200, {
      message: "Código de verificación reenviado exitosamente",
      delivery: response.CodeDeliveryDetails
    });
  } catch (error) {
    console.error("Error:", error);

    // Manejar errores específicos
    if (error.name === "UserNotFoundException") {
      return formatResponse(404, { error: "Usuario no encontrado" });
    } else if (error.name === "LimitExceededException") {
      return formatResponse(429, { error: "Se ha excedido el límite de intentos" });
    } else if (error.name === "InvalidParameterException") {
      return formatResponse(400, { error: "Parámetros inválidos: " + error.message });
    }

    // Error general
    return formatResponse(500, { error: "Error al reenviar el código de verificación" });
  }
}; 