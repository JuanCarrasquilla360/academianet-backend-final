/**
 * Script para probar la carga de un archivo Excel al bucket S3
 * 
 * Uso: node scripts/test-excel-upload.js <bucketName> <filePath>
 * 
 * Ejemplo: node scripts/test-excel-upload.js academianet-excel-123456789012-us-east-1 ./test-data/instituciones.xlsx
 */

const { S3Client, PutObjectCommand, GetBucketNotificationConfigurationCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function uploadExcelToS3(bucketName, filePath) {
  try {
    console.log('=== TEST EXCEL UPLOAD SCRIPT [INICIO] ===');
    console.log(`Fecha y hora: ${new Date().toISOString()}`);
    console.log(`Node.js version: ${process.version}`);
    console.log('AWS SDK version:', require('@aws-sdk/client-s3/package.json').version);
    console.log(`Bucket destino: ${bucketName}`);
    console.log(`Archivo a subir: ${filePath}`);
    
    // Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      console.error(`ERROR: El archivo ${filePath} no existe.`);
      process.exit(1);
    }
    
    // Calcular hash del archivo para verificar integridad
    const hash = crypto.createHash('md5');
    const fileBuffer = fs.readFileSync(filePath);
    hash.update(fileBuffer);
    const fileHash = hash.digest('hex');
    
    // Generar nombre único para evitar problemas de caché
    const fileName = path.basename(filePath);
    const fileExt = path.extname(fileName);
    const fileBaseName = path.basename(fileName, fileExt);
    const timestamp = Date.now();
    const uniqueFileName = `${fileBaseName}_${timestamp}${fileExt}`;
    const s3Key = `uploads/${uniqueFileName}`;
    
    console.log(`=== DETALLES DEL ARCHIVO ===`);
    console.log(`Tamaño del archivo: ${fileBuffer.length} bytes (${(fileBuffer.length / 1024).toFixed(2)} KB)`);
    console.log(`MD5 Hash: ${fileHash}`);
    console.log(`Nombre original: ${fileName}`);
    console.log(`Nombre único: ${uniqueFileName}`);
    console.log(`Clave S3 destino: ${s3Key}`);
    console.log(`Bucket completo URI: s3://${bucketName}/${s3Key}`);
    
    // Verificar configuración de notificaciones del bucket
    console.log('\n=== VERIFICANDO CONFIGURACIÓN DE NOTIFICACIONES DEL BUCKET ===');
    
    // Configurar cliente S3
    console.log('Inicializando cliente S3...');
    const s3Client = new S3Client();
    console.log('Cliente S3 inicializado');

    try {
      console.log(`Obteniendo configuración de notificaciones para el bucket ${bucketName}...`);
      const notificationConfig = await s3Client.send(new GetBucketNotificationConfigurationCommand({
        Bucket: bucketName
      }));
      
      console.log('Configuración de notificaciones obtenida:');
      console.log(JSON.stringify(notificationConfig, null, 2));
      
      // Verificar si hay configuración para Lambda
      if (notificationConfig.LambdaFunctionConfigurations && 
          notificationConfig.LambdaFunctionConfigurations.length > 0) {
        console.log(`Se encontraron ${notificationConfig.LambdaFunctionConfigurations.length} configuraciones de Lambda`);
        
        notificationConfig.LambdaFunctionConfigurations.forEach((config, index) => {
          console.log(`\nConfiguración Lambda #${index + 1}:`);
          console.log(`- ARN: ${config.LambdaFunctionArn}`);
          console.log(`- Eventos: ${config.Events.join(', ')}`);
          
          if (config.Filter && config.Filter.Key && config.Filter.Key.FilterRules) {
            console.log('- Reglas de filtro:');
            config.Filter.Key.FilterRules.forEach(rule => {
              console.log(`  * ${rule.Name}: ${rule.Value}`);
              
              // Verificar si nuestro archivo cumpliría con este filtro
              if (rule.Name === 'prefix' && !s3Key.startsWith(rule.Value)) {
                console.warn(`  * ADVERTENCIA: Nuestro archivo con clave ${s3Key} no cumple con el prefijo ${rule.Value}`);
              }
              if (rule.Name === 'suffix' && !s3Key.endsWith(rule.Value)) {
                console.warn(`  * ADVERTENCIA: Nuestro archivo con clave ${s3Key} no cumple con el sufijo ${rule.Value}`);
              }
            });
          } else {
            console.log('- Sin reglas de filtro');
          }
        });
      } else {
        console.warn('ADVERTENCIA: No se encontraron configuraciones de Lambda para este bucket');
      }
    } catch (notificationError) {
      console.error('ERROR al obtener configuración de notificaciones:', notificationError);
      console.log('Continuando con la carga a pesar del error...');
    }
    
    // Subir archivo a S3
    console.log('\n=== SUBIENDO ARCHIVO A S3 ===');
    console.log(`Iniciando carga del archivo ${uniqueFileName} al bucket ${bucketName}...`);
    console.log(`Tamaño: ${(fileBuffer.length / 1024).toFixed(2)} KB`);
    
    const startTime = Date.now();
    try {
      const response = await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ContentMD5: Buffer.from(fileHash, 'hex').toString('base64')
      }));
      
      const uploadTime = Date.now() - startTime;
      console.log(`\n¡Archivo subido exitosamente en ${uploadTime}ms!`);
      console.log('Respuesta de S3:');
      console.log(`- ETag: ${response.ETag}`);
      console.log(`- Versión: ${response.VersionId || 'N/A'}`);
      console.log(`- Servidor: ${response.$metadata?.httpStatusCode} ${response.$metadata?.requestId || ''}`);
      
      // Resumen y siguientes pasos
      console.log('\n=== RESUMEN ===');
      console.log(`Archivo: ${fileName}`);
      console.log(`Tamaño: ${(fileBuffer.length / 1024).toFixed(2)} KB`);
      console.log(`Bucket: ${bucketName}`);
      console.log(`Clave S3: ${s3Key}`);
      console.log(`URL completa: s3://${bucketName}/${s3Key}`);
      console.log(`Tiempo de carga: ${uploadTime}ms`);
      
      console.log('\n=== SIGUIENTES PASOS ===');
      console.log('La función Lambda debería ejecutarse automáticamente.');
      console.log('Para verificar los logs de la función Lambda, ejecuta:');
      console.log(`aws logs tail /aws/lambda/AcademianetBackendFinalStack-ExcelProcessor... --follow`);
      console.log('\nPara verificar que el archivo está en S3:');
      console.log(`aws s3 ls s3://${bucketName}/${s3Key}`);
      
    } catch (uploadError) {
      console.error('\nERROR al subir el archivo:', uploadError);
      console.error('Código:', uploadError.Code);
      console.error('Mensaje:', uploadError.message);
      console.error('Request ID:', uploadError.$metadata?.requestId);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n=== ERROR CRÍTICO ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Verificar argumentos
if (process.argv.length < 4) {
  console.log('Uso: node scripts/test-excel-upload.js <bucketName> <filePath>');
  console.log('Ejemplo: node scripts/test-excel-upload.js mi-bucket ./archivo.xlsx');
  process.exit(1);
}

const bucketName = process.argv[2];
const filePath = process.argv[3];

// Ejecutar la función
uploadExcelToS3(bucketName, filePath); 