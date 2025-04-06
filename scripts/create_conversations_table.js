// Script para crear la tabla de conversaciones en DynamoDB
const AWS = require("aws-sdk");

// Configuración de AWS - sin hardcodear credenciales
AWS.config.update({
  region: "us-east-1",
  // Las credenciales se tomarán del archivo ~/.aws/credentials o variables de entorno
});

// Cliente para DynamoDB
const dynamodbAdmin = new AWS.DynamoDB();

// Función para crear la tabla de conversaciones
async function createConversationsTable() {
  const params = {
    TableName: "Conversations",
    KeySchema: [
      { AttributeName: "id", KeyType: "HASH" } // Clave de partición
    ],
    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "S" }
    ],
    BillingMode: "PAY_PER_REQUEST" // Para no preocuparse por capacidad aprovisionada
  };

  try {
    // Verificar si la tabla ya existe
    try {
      await dynamodbAdmin.describeTable({ TableName: "Conversations" }).promise();
      console.log("La tabla Conversations ya existe.");
      return true;
    } catch (error) {
      if (error.code !== "ResourceNotFoundException") {
        throw error;
      }
      // La tabla no existe, vamos a crearla
    }

    // Crear la tabla
    const result = await dynamodbAdmin.createTable(params).promise();
    console.log("Tabla Conversations creada con éxito:", result);

    // Esperar a que la tabla esté activa
    console.log("Esperando a que la tabla esté activa...");
    await dynamodbAdmin.waitFor("tableExists", { TableName: "Conversations" }).promise();
    console.log("¡Tabla Conversations lista para usar!");

    return true;
  } catch (error) {
    console.error("Error al crear la tabla Conversations:", error);
    return false;
  }
}

// Ejecutar la función si este script se ejecuta directamente
if (require.main === module) {
  createConversationsTable()
    .then(success => {
      if (success) {
        console.log("Proceso completado con éxito.");
      } else {
        console.error("El proceso falló.");
        process.exit(1);
      }
    })
    .catch(error => {
      console.error("Error no manejado:", error);
      process.exit(1);
    });
}

module.exports = { createConversationsTable }; 