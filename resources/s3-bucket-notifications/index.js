// Recurso personalizado para configurar notificaciones de S3 y permisos de Lambda
// Este enfoque evita la dependencia circular entre el bucket y el permiso de Lambda

const AWS = require('aws-sdk');

// Inicializar clientes
console.log('=== CUSTOM RESOURCE FOR S3 NOTIFICATIONS [INIT] ===');
console.log('Node.js version:', process.version);
console.log('AWS SDK version:', require('aws-sdk/package.json').version);

const s3 = new AWS.S3();
const lambda = new AWS.Lambda();

exports.handler = async (event) => {
  console.log('=== S3 NOTIFICATION CUSTOM RESOURCE EVENT ===');
  console.log('Event received:', JSON.stringify(event, null, 2));
  console.log('Environment variables:', process.env.AWS_REGION, process.env.AWS_EXECUTION_ENV);
  
  // Preparar la respuesta
  let responseData = {};
  let responseStatus = 'SUCCESS';
  
  try {
    // Extraer propiedades
    const { 
      RequestType, 
      ResourceProperties, 
      PhysicalResourceId,
      StackId,
      RequestId,
      LogicalResourceId
    } = event;
    
    const { 
      BucketName, 
      LambdaArn, 
      LambdaName,
      Prefix, 
      Suffix 
    } = ResourceProperties;
    
    console.log(`Request Type: ${RequestType}`);
    console.log(`Resource Properties:
      - Bucket: ${BucketName}
      - Lambda ARN: ${LambdaArn}
      - Lambda Name: ${LambdaName}
      - Prefix: ${Prefix}
      - Suffix: ${Suffix}
    `);
    
    // Respuesta común para CloudFormation
    const cfnResponse = {
      Status: responseStatus,
      PhysicalResourceId: PhysicalResourceId || `s3-notification-${BucketName}`,
      StackId,
      RequestId,
      LogicalResourceId,
      Data: responseData
    };
    
    // Manejar diferentes tipos de solicitudes
    if (RequestType === 'Create' || RequestType === 'Update') {
      console.log('=== PROCESSING CREATE/UPDATE ===');
      
      // Paso 1: Verificar si el bucket existe
      console.log('Verificando existencia del bucket...');
      try {
        const headBucketParams = {
          Bucket: BucketName
        };
        await s3.headBucket(headBucketParams).promise();
        console.log(`Bucket ${BucketName} existe y es accesible`);
      } catch (bucketError) {
        console.error(`ERROR al verificar bucket ${BucketName}:`, bucketError);
        throw new Error(`El bucket ${BucketName} no existe o no es accesible: ${bucketError.message}`);
      }
      
      // Paso 2: Verificar si la función Lambda existe
      console.log('Verificando existencia de la función Lambda...');
      try {
        const getFunctionParams = {
          FunctionName: LambdaName
        };
        const lambdaInfo = await lambda.getFunction(getFunctionParams).promise();
        console.log(`Función Lambda ${LambdaName} existe:`, {
          Runtime: lambdaInfo.Configuration.Runtime,
          Handler: lambdaInfo.Configuration.Handler,
          LastModified: lambdaInfo.Configuration.LastModified
        });
      } catch (lambdaError) {
        console.error(`ERROR al verificar función Lambda ${LambdaName}:`, lambdaError);
        throw new Error(`La función Lambda ${LambdaName} no existe o no es accesible: ${lambdaError.message}`);
      }
      
      // Paso 3: Configurar permisos de Lambda
      console.log('Configurando permisos de Lambda...');
      const statementId = `s3-permission-${Date.now()}`;
      try {
        const permissionParams = {
          Action: 'lambda:InvokeFunction',
          FunctionName: LambdaName,
          Principal: 's3.amazonaws.com',
          SourceArn: `arn:aws:s3:::${BucketName}`,
          StatementId: statementId
        };
        
        console.log('Parámetros de permisos Lambda:', JSON.stringify(permissionParams, null, 2));
        await lambda.addPermission(permissionParams).promise();
        console.log(`Permisos de Lambda configurados con éxito (StatementId: ${statementId})`);
      } catch (error) {
        // Ignorar error si el permiso ya existe
        if (error.code === 'ResourceConflictException') {
          console.log(`Los permisos de Lambda ya existían: ${error.message}`);
        } else {
          console.error('ERROR al configurar permisos Lambda:', error);
          throw error;
        }
      }
      
      // Paso 4: Obtener la configuración actual de notificaciones
      console.log('Obteniendo configuración actual de notificaciones S3...');
      try {
        const currentConfig = await s3.getBucketNotificationConfiguration({
          Bucket: BucketName
        }).promise();
        
        console.log('Configuración actual de notificaciones:', JSON.stringify(currentConfig, null, 2));
      } catch (getConfigError) {
        console.error('ERROR al obtener configuración de notificaciones:', getConfigError);
        // Continuamos aunque no podamos obtener la configuración actual
      }
      
      // Paso 5: Configurar notificaciones de S3
      console.log('Configurando notificaciones de S3...');
      const filterRules = [];
      
      if (Prefix) {
        filterRules.push({
          Name: 'prefix',
          Value: Prefix
        });
      }
      
      if (Suffix) {
        filterRules.push({
          Name: 'suffix',
          Value: Suffix
        });
      }
      
      const notificationConfig = {
        LambdaFunctionConfigurations: [
          {
            Events: ['s3:ObjectCreated:*'],
            LambdaFunctionArn: LambdaArn,
            Filter: filterRules.length > 0 ? {
              Key: {
                FilterRules: filterRules
              }
            } : undefined
          }
        ]
      };
      
      console.log('Nueva configuración de notificaciones:', JSON.stringify(notificationConfig, null, 2));
      
      try {
        await s3.putBucketNotificationConfiguration({
          Bucket: BucketName,
          NotificationConfiguration: notificationConfig
        }).promise();
        
        console.log('Notificaciones de S3 configuradas con éxito');
      } catch (putConfigError) {
        console.error('ERROR al configurar notificaciones S3:', putConfigError);
        throw putConfigError;
      }
      
      // Verificar la configuración después de aplicarla
      console.log('Verificando configuración final de notificaciones S3...');
      try {
        const finalConfig = await s3.getBucketNotificationConfiguration({
          Bucket: BucketName
        }).promise();
        
        console.log('Configuración final de notificaciones:', JSON.stringify(finalConfig, null, 2));
        
        // Comprobar que nuestra Lambda está en la configuración
        const lambdaConfigs = finalConfig.LambdaFunctionConfigurations || [];
        const ourLambdaConfig = lambdaConfigs.find(config => config.LambdaFunctionArn === LambdaArn);
        
        if (ourLambdaConfig) {
          console.log('Configuración verificada correctamente:', ourLambdaConfig);
        } else {
          console.warn('ADVERTENCIA: La configuración final no incluye nuestra Lambda');
        }
      } catch (verifyConfigError) {
        console.error('ERROR al verificar configuración final:', verifyConfigError);
        // No lanzamos excepción, solo registramos el error
      }
      
      console.log('=== CREATE/UPDATE COMPLETADO CON ÉXITO ===');
      responseData = {
        Message: 'Configuración aplicada correctamente',
        BucketName,
        LambdaArn,
        StatementId: statementId
      };
      
    } else if (RequestType === 'Delete') {
      console.log('=== PROCESSING DELETE ===');
      
      // Verificar configuración actual antes de eliminar
      console.log('Verificando configuración actual antes de eliminar...');
      try {
        const currentConfig = await s3.getBucketNotificationConfiguration({
          Bucket: BucketName
        }).promise();
        
        console.log('Configuración actual de notificaciones:', JSON.stringify(currentConfig, null, 2));
      } catch (getConfigError) {
        console.error('ERROR al obtener configuración de notificaciones:', getConfigError);
        // Continuamos aunque no podamos obtener la configuración actual
      }
      
      // Eliminar notificaciones del bucket
      console.log('Eliminando configuración de notificaciones...');
      try {
        await s3.putBucketNotificationConfiguration({
          Bucket: BucketName,
          NotificationConfiguration: {} // Configuración vacía para eliminar notificaciones
        }).promise();
        
        console.log('Configuración de notificaciones eliminada con éxito');
      } catch (deleteConfigError) {
        console.error('ERROR al eliminar configuración de notificaciones:', deleteConfigError);
        // No lanzamos excepción, solo registramos el error
      }
      
      console.log('=== DELETE COMPLETADO CON ÉXITO ===');
      responseData = { 
        Message: 'Configuración eliminada correctamente',
        BucketName
      };
    }
    
    console.log('Respuesta final:', JSON.stringify(cfnResponse, null, 2));
    return cfnResponse;
    
  } catch (error) {
    console.error('=== ERROR CRÍTICO ===');
    console.error('Nombre:', error.name);
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
    
    // En caso de error, devolvemos FAILED a CloudFormation
    const errorResponse = {
      Status: 'FAILED',
      Reason: `Error: ${error.message}. Consulta los logs de CloudWatch para más detalles.`,
      PhysicalResourceId: event.PhysicalResourceId || `s3-notification-error-${Date.now()}`,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: { 
        ErrorDetails: error.message,
        ErrorName: error.name
      }
    };
    
    console.log('Respuesta de error:', JSON.stringify(errorResponse, null, 2));
    return errorResponse;
  }
}; 