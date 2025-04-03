const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

// Initialize client
const dynamoClient = new DynamoDBClient();

// Environment variables
const PROGRAMS_TABLE = process.env.PROGRAMS_TABLE || "ProgramasAcademicos";

/**
 * Lambda function to get academic programs from DynamoDB
 */
exports.handler = async (event, context) => {
  try {
    console.log("Processing request to get academic programs");
    
    // Parse query string parameters
    const queryParams = event.queryStringParameters || {};
    
    // Get pagination parameters
    const limit = queryParams.limit ? parseInt(queryParams.limit) : 50;
    const lastEvaluatedKey = queryParams.nextToken 
      ? JSON.parse(decodeURIComponent(queryParams.nextToken))
      : undefined;
    
    // Get filter parameters
    const nivel = queryParams.nivel;
    const modalidad = queryParams.modalidad;
    const institucionId = queryParams.institucionId;
    const municipio = queryParams.municipio;
    
    // Base scan params
    const params = {
      TableName: PROGRAMS_TABLE,
      Limit: limit
    };
    
    // Add pagination if provided
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }
    
    // Add filter expressions if filters are provided
    const expressionParts = [];
    const expressionAttributeValues = {};
    
    if (nivel) {
      expressionParts.push("nivel = :nivel");
      expressionAttributeValues[":nivel"] = { S: nivel };
    }
    
    if (modalidad) {
      expressionParts.push("modalidad = :modalidad");
      expressionAttributeValues[":modalidad"] = { S: modalidad };
    }
    
    if (institucionId) {
      expressionParts.push("institucionId = :institucionId");
      expressionAttributeValues[":institucionId"] = { S: institucionId };
    }
    
    if (municipio) {
      expressionParts.push("municipio = :municipio");
      expressionAttributeValues[":municipio"] = { S: municipio };
    }
    
    if (expressionParts.length > 0) {
      params.FilterExpression = expressionParts.join(" AND ");
      params.ExpressionAttributeValues = expressionAttributeValues;
    }
    
    console.log("DynamoDB Query Params:", JSON.stringify(params, null, 2));
    
    // Execute the query
    const result = await dynamoClient.send(new ScanCommand(params));
    
    // Transform DynamoDB items to regular JavaScript objects
    const programs = result.Items ? result.Items.map(item => unmarshall(item)) : [];
    
    // Prepare next token for pagination if there are more items
    let nextToken = undefined;
    if (result.LastEvaluatedKey) {
      nextToken = encodeURIComponent(JSON.stringify(result.LastEvaluatedKey));
    }
    
    // Return the items with proper CORS headers
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Access-Control-Allow-Origin",
        "Access-Control-Allow-Methods": "OPTIONS,GET",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        programs: programs,
        count: programs.length,
        nextToken,
        // Include filter info in response
        filters: {
          nivel,
          modalidad,
          institucionId,
          municipio
        }
      }),
    };
  } catch (error) {
    console.error("Error querying academic programs from DynamoDB:", error);
    
    // Improved error handling with specific error types
    let statusCode = 500;
    let errorMessage = "Error interno al recuperar programas académicos";
    
    if (error.name === "ResourceNotFoundException") {
      statusCode = 404;
      errorMessage = `La tabla ${PROGRAMS_TABLE} no existe`;
    } else if (error.name === "ValidationException") {
      statusCode = 400;
      errorMessage = "Error de validación en la consulta";
    } else if (error.name === "ProvisionedThroughputExceededException") {
      statusCode = 429;
      errorMessage = "Capacidad de DynamoDB excedida, intente más tarde";
    }
    
    return {
      statusCode,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Access-Control-Allow-Origin",
        "Access-Control-Allow-Methods": "OPTIONS,GET",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: errorMessage,
        error: error.message || "Error desconocido",
        // Include request info for debugging
        time: new Date().toISOString(),
        requestId: event.requestContext?.requestId
      }),
    };
  }
}; 