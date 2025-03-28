const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient, BatchWriteItemCommand, ScanCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const XLSX = require('xlsx');

// Initialize clients
console.log('=== LAMBDA INIT [process_excel] ===');
console.log('Node.js version:', process.version);
console.log('Available memory:', process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE + ' MB');
console.log('Node Options:', process.env.NODE_OPTIONS || 'None');
console.log('AWS SDK version:', require('@aws-sdk/client-s3/package.json').version);
console.log('XLSX version:', require('xlsx/package.json').version);
const s3Client = new S3Client();
const dynamoClient = new DynamoDBClient();

// Environment variables
const INSTITUTIONS_SNIES_TABLE = process.env.INSTITUTIONS_SNIES_TABLE || 'instituciones_snies';
console.log('Using DynamoDB table:', INSTITUTIONS_SNIES_TABLE);

// Configurar opciones para XLSX
const EXCEL_PARSE_OPTIONS = { 
  type: 'buffer',
  cellFormula: false,  // Desactivar fórmulas para ahorrar memoria
  cellHTML: false,     // Desactivar HTML para ahorrar memoria
  cellStyles: false,   // Desactivar estilos para ahorrar memoria
  cellDates: true,     // Mantener fechas como fechas
  sheetStubs: false,   // No generar celdas vacías
  bookVBA: false,      // Ignorar VBA
  bookDeps: false,     // Ignorar dependencias
  sheetRows: 0         // Sin límite de filas (0 = todas)
};

/**
 * Lambda function triggered by S3 when a new Excel file is uploaded
 */
exports.handler = async (event, context) => {
  // Mostrar información de memoria al inicio
  const heapStats = getMemoryStats();
  console.log('=== EXCEL PROCESSING BEGIN ===');
  console.log('Initial memory usage:', heapStats);
  console.log('Lambda function triggered with event type:', typeof event);
  console.log('Event stringified length:', JSON.stringify(event).length);
  console.log('Event sample:', JSON.stringify(event).substring(0, 500) + '...');
  console.log('Context:', JSON.stringify({
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    invokedFunctionArn: context.invokedFunctionArn,
    memoryLimitInMB: context.memoryLimitInMB,
    awsRequestId: context.awsRequestId,
    logGroupName: context.logGroupName,
    logStreamName: context.logStreamName,
  }, null, 2));
  
  try {
    // Validate event structure
    console.log('STEP 0: Validating event structure...');
    
    if (!event) {
      console.error('ERROR: Event is null or undefined');
      throw new Error('Event is null or undefined');
    }
    
    if (!event.Records) {
      console.error('ERROR: Event has no Records array');
      console.error('Full event:', JSON.stringify(event, null, 2));
      throw new Error('Invalid event structure: No Records array');
    }
    
    if (!Array.isArray(event.Records) || event.Records.length === 0) {
      console.error('ERROR: Event Records is not an array or is empty');
      console.error('Full event:', JSON.stringify(event, null, 2));
      throw new Error('Invalid event structure: Records is not an array or is empty');
    }
    
    if (!event.Records[0].s3) {
      console.error('ERROR: First record has no s3 property');
      console.error('Record:', JSON.stringify(event.Records[0], null, 2));
      throw new Error('Invalid event structure: Missing Records[0].s3 property');
    }
    
    if (!event.Records[0].s3.bucket || !event.Records[0].s3.bucket.name) {
      console.error('ERROR: Missing bucket name in s3 event');
      console.error('S3 data:', JSON.stringify(event.Records[0].s3, null, 2));
      throw new Error('Invalid event structure: Missing bucket name');
    }
    
    if (!event.Records[0].s3.object || !event.Records[0].s3.object.key) {
      console.error('ERROR: Missing object key in s3 event');
      console.error('S3 data:', JSON.stringify(event.Records[0].s3, null, 2));
      throw new Error('Invalid event structure: Missing object key');
    }
    
    // Get bucket and key from event
    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    
    console.log(`STEP 1: Processing file ${key} from bucket ${bucket}`);
    console.log('Event details:');
    console.log(`- Event source: ${event.Records[0].eventSource}`);
    console.log(`- Event name: ${event.Records[0].eventName}`);
    console.log(`- Event time: ${event.Records[0].eventTime}`);
    console.log(`- S3 bucket ARN: ${event.Records[0].s3.bucket.arn}`);
    console.log(`- S3 object size: ${event.Records[0].s3.object.size} bytes`);
    
    // Revisar memoria después de procesar el evento
    console.log('Memory usage after event processing:', getMemoryStats());
    
    try {
      // Get the Excel file from S3
      console.log('STEP 2: Getting file from S3...');
      console.log(`- Using bucket: ${bucket}`);
      console.log(`- Using key: ${key}`);
      
      const getObjectCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key
      });
      
      console.log('- Sending S3 GetObjectCommand...');
      const s3CommandStart = Date.now();
      const s3Response = await s3Client.send(getObjectCommand);
      console.log(`- S3 GetObjectCommand completed in ${Date.now() - s3CommandStart}ms`);
      console.log('- S3 response received:');
      console.log(`  - ContentType: ${s3Response.ContentType}`);
      console.log(`  - ContentLength: ${s3Response.ContentLength}`);
      console.log(`  - LastModified: ${s3Response.LastModified}`);
      
      // Verificar si el archivo es demasiado grande (más de 30MB)
      if (s3Response.ContentLength && s3Response.ContentLength > 30 * 1024 * 1024) {
        console.warn(`ADVERTENCIA: El archivo es muy grande (${(s3Response.ContentLength / (1024 * 1024)).toFixed(2)} MB), puede causar problemas de memoria`);
      }
      
      // Read the Excel file
      console.log('STEP 3: Reading file content...');
      const s3Stream = s3Response.Body;
      
      console.log('STEP 3.1: Reading stream directly...');
      console.log('Memory usage before reading stream:', getMemoryStats());
      
      // Usar una técnica diferente para leer el archivo, más eficiente en memoria
      const streamStart = Date.now();
      let buffer;
      
      try {
        // Usar una técnica de lectura en trozos en lugar de acumular todos en memoria
        // Esto ayuda a reducir el consumo de memoria
        const chunks = [];
        let totalBytes = 0;
        
        for await (const chunk of s3Stream) {
          chunks.push(chunk);
          totalBytes += chunk.length;
          
          // Solo mostrar el progreso cada 1MB para reducir el log
          if (totalBytes % (1 * 1024 * 1024) < chunk.length) {
            console.log(`- Read ${(totalBytes / (1024 * 1024)).toFixed(2)} MB so far...`);
            // Liberar memoria innecesaria
            if (global.gc) {
              console.log('Forcing garbage collection...');
              global.gc();
            }
          }
        }
        
        console.log(`- Stream reading completed in ${Date.now() - streamStart}ms`);
        console.log(`- Total bytes read: ${totalBytes} (${(totalBytes / (1024 * 1024)).toFixed(2)} MB)`);
        
        // Crear buffer solo cuando tenemos todos los datos
        console.log('STEP 3.2: Creating buffer from chunks...');
        const bufferStart = Date.now();
        buffer = Buffer.concat(chunks);
        console.log(`- Buffer created in ${Date.now() - bufferStart}ms with length: ${buffer.length} bytes`);
        
        // Liberar la memoria de los chunks individuales
        while (chunks.length > 0) {
          chunks.pop();
        }
        
        // Forzar garbage collection si está disponible
        if (global.gc) {
          console.log('Forcing garbage collection after buffer creation...');
          global.gc();
        }
        
      } catch (streamError) {
        console.error('ERROR reading stream:', streamError);
        console.error('Stream error name:', streamError.name);
        console.error('Stream error message:', streamError.message);
        throw new Error(`Failed to read S3 stream: ${streamError.message}`);
      }
      
      console.log('Memory usage after buffer creation:', getMemoryStats());
      
      // Parse the Excel file
      console.log('STEP 4: Parsing Excel with XLSX...');
      console.log('- Buffer size:', (buffer.length / (1024 * 1024)).toFixed(2) + ' MB');
      console.log('- Using XLSX options:', JSON.stringify(EXCEL_PARSE_OPTIONS));
      
      const xlsxStart = Date.now();
      try {
        console.log('- Starting Excel parsing...');
        // Usar opciones optimizadas para el análisis
        const workbook = XLSX.read(buffer, EXCEL_PARSE_OPTIONS);
        
        // Liberar la memoria del buffer una vez que hemos leído el Excel
        buffer = null;
        
        // Forzar garbage collection si está disponible
        if (global.gc) {
          console.log('Forcing garbage collection after Excel parsing...');
          global.gc();
        }
        
        console.log(`- Excel parsing completed in ${Date.now() - xlsxStart}ms`);
        console.log('- Excel parsed successfully. Sheets found:', workbook.SheetNames);
        console.log('Memory usage after Excel parsing:', getMemoryStats());
        
        // Assume the first sheet is the one we want
        if (workbook.SheetNames.length === 0) {
          throw new Error('Excel file has no sheets');
        }
        
        const sheetName = workbook.SheetNames[0];
        console.log(`- Using sheet: "${sheetName}"`);
        const worksheet = workbook.Sheets[sheetName];
        
        // Log the ranges in the worksheet
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        console.log(`- Worksheet range: ${worksheet['!ref']}`);
        console.log(`- Worksheet dimensions: ${range.e.r - range.s.r + 1} rows, ${range.e.c - range.s.c + 1} columns`);
        
        // Convert worksheet to JSON
        console.log('STEP 5: Converting worksheet to JSON...');
        const jsonStart = Date.now();
        
        // Usar un enfoque de procesamiento por lotes si hay muchas filas
        let data;
        const totalRows = range.e.r - range.s.r + 1;
        
        if (totalRows > 1000) {
          console.log(`- High row count detected (${totalRows}), using optimized conversion...`);
          // Usar una conversión optimizada para grandes conjuntos de datos
          data = [];
          
          // Procesar por lotes de 1000 filas para evitar consumir demasiada memoria
          const batchSize = 1000;
          for (let startRow = range.s.r; startRow <= range.e.r; startRow += batchSize) {
            const endRow = Math.min(startRow + batchSize - 1, range.e.r);
            console.log(`- Converting rows ${startRow} to ${endRow}...`);
            
            // Crear una referencia parcial
            const partialRef = XLSX.utils.encode_range({
              s: { r: startRow, c: range.s.c },
              e: { r: endRow, c: range.e.c }
            });
            
            // Crear una hoja de trabajo parcial
            const partialWorksheet = {};
            for (const cellAddress in worksheet) {
              if (cellAddress === '!ref' || cellAddress === '!margins') continue;
              
              const cellRef = XLSX.utils.decode_cell(cellAddress);
              if (cellRef.r >= startRow && cellRef.r <= endRow) {
                partialWorksheet[cellAddress] = worksheet[cellAddress];
              }
            }
            partialWorksheet['!ref'] = partialRef;
            
            // Convertir este lote a JSON
            const partialData = XLSX.utils.sheet_to_json(partialWorksheet);
            data.push(...partialData);
            
            // Forzar garbage collection después de cada lote
            partialWorksheet = null;
            if (global.gc) {
              console.log('Forcing garbage collection after batch conversion...');
              global.gc();
            }
          }
        } else {
          // Para conjuntos de datos pequeños, usar el enfoque estándar
          data = XLSX.utils.sheet_to_json(worksheet);
        }
        
        // Liberar la memoria del workbook una vez que tenemos los datos JSON
        workbook.Sheets = {};
        
        console.log(`- JSON conversion completed in ${Date.now() - jsonStart}ms`);
        console.log(`- Processed ${data.length} rows from Excel file`);
        console.log('Memory usage after JSON conversion:', getMemoryStats());
        
        if (data.length > 0) {
          console.log('- First row keys:', Object.keys(data[0]));
          // Solo imprimir la primera fila en lugar de todo el objeto para ahorrar memoria en los logs
          console.log('- First row sample:', JSON.stringify(data[0], null, 2));
        } else {
          console.warn('WARNING: No data rows found in Excel file');
        }
        
        // Procesar los datos por lotes para DynamoDB
        if (data.length > 0) {
          // Clear existing data from the table
          console.log('STEP 6: Clearing existing data from table...');
          const clearStart = Date.now();
          await clearTable();
          console.log(`- Table clearing completed in ${Date.now() - clearStart}ms`);
          
          // Prepare items for BatchWriteItem
          console.log('STEP 7: Preparing data batches for DynamoDB...');
          const batchSize = 25; // DynamoDB permite 25 items por lote
          const batches = [];
          
          // Crear lotes de ítems
          for (let i = 0; i < data.length; i += batchSize) {
            batches.push(data.slice(i, i + batchSize));
          }
          console.log(`- Created ${batches.length} batches of max ${batchSize} items each`);
          
          // Process each batch
          console.log('STEP 8: Processing data batches...');
          let totalProcessed = 0;
          let batchesProcessed = 0;
          const batchingStart = Date.now();
          
          for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            console.log(`- Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} items`);
            
            const putRequests = batch.map(item => {
              // Check for the primary key (codigo)
              const codigo = String(item.codigo || item.CODIGO || '');
              if (!codigo) {
                console.warn('WARNING: Item missing codigo, generating random one');
              }
              
              // Normalize Excel data to match DynamoDB schema
              const normalizedItem = {
                codigo: codigo || `gen_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
                nombre: item.nombre || item.NOMBRE || '',
                caracter: item.caracter || item.CARACTER || '',
                naturaleza: item.naturaleza || item.NATURALEZA || '',
                sector: item.sector || item.SECTOR || '',
                departamento: item.departamento || item.DEPARTAMENTO || '',
                municipio: item.municipio || item.MUNICIPIO || '',
                direccion: item.direccion || item.DIRECCION || '',
                telefono: item.telefono || item.TELEFONO || '',
                // Add more fields as needed
                importedAt: new Date().toISOString()
              };
              
              return {
                PutRequest: {
                  Item: marshall(normalizedItem)
                }
              };
            });
            
            // Write batch to DynamoDB
            console.log(`- STEP 8.${batchIndex + 1}: Writing batch ${batchIndex + 1} to DynamoDB...`);
            try {
              const batchWriteParams = {
                RequestItems: {
                  [INSTITUTIONS_SNIES_TABLE]: putRequests
                }
              };
              
              const batchStart = Date.now();
              const result = await dynamoClient.send(new BatchWriteItemCommand(batchWriteParams));
              console.log(`- Batch write completed in ${Date.now() - batchStart}ms`);
              
              if (result.UnprocessedItems && 
                  result.UnprocessedItems[INSTITUTIONS_SNIES_TABLE] && 
                  result.UnprocessedItems[INSTITUTIONS_SNIES_TABLE].length > 0) {
                console.warn(`- WARNING: ${result.UnprocessedItems[INSTITUTIONS_SNIES_TABLE].length} items unprocessed in batch ${batchIndex + 1}`);
              } else {
                console.log(`- All items processed in batch ${batchIndex + 1}`);
              }
              
              totalProcessed += batch.length;
              batchesProcessed++;
              
              // Mostrar progreso periódicamente
              if (batchIndex % 10 === 0 || batchIndex === batches.length - 1) {
                console.log(`- Progress: ${totalProcessed}/${data.length} items (${Math.round(totalProcessed/data.length*100)}%)`);
                console.log('- Memory usage:', getMemoryStats());
              }
              
            } catch (batchError) {
              console.error(`- ERROR processing batch ${batchIndex + 1}:`, batchError);
              console.error('- Error code:', batchError.code);
              console.error('- Error name:', batchError.name);
              console.error('- Error message:', batchError.message);
              throw new Error(`Failed to process batch ${batchIndex + 1}: ${batchError.message}`);
            }
          }
          
          console.log(`- All batches processing completed in ${Date.now() - batchingStart}ms`);
          console.log(`- Successfully processed ${batchesProcessed}/${batches.length} batches (${totalProcessed}/${data.length} items)`);
          
          console.log(`=== EXCEL PROCESSING COMPLETED SUCCESSFULLY ===`);
          console.log(`- Successfully imported ${totalProcessed} records to DynamoDB table ${INSTITUTIONS_SNIES_TABLE}`);
          console.log(`- Final memory usage:`, getMemoryStats());
          
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: `Successfully processed ${totalProcessed} of ${data.length} records from ${key}`,
              table: INSTITUTIONS_SNIES_TABLE,
              processedRecords: totalProcessed
            })
          };
        } else {
          console.log('No data to process, returning success with 0 records');
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: `Excel file had 0 records to process from ${key}`,
              table: INSTITUTIONS_SNIES_TABLE,
              processedRecords: 0
            })
          };
        }
        
      } catch (xlsxError) {
        console.error('ERROR parsing Excel file:', xlsxError);
        console.error('Error name:', xlsxError.name);
        console.error('Error message:', xlsxError.message);
        console.error('Memory usage at error:', getMemoryStats());
        throw new Error(`Failed to parse Excel file: ${xlsxError.message}`);
      }
      
    } catch (innerError) {
      console.error('Inner error details:');
      console.error('Name:', innerError.name);
      console.error('Message:', innerError.message);
      console.error('Stack:', innerError.stack);
      console.error('Memory usage at error:', getMemoryStats());
      throw innerError; // Re-throw to be caught by the outer catch
    }
    
  } catch (error) {
    console.error('=== ERROR OCCURRED ===');
    console.error('Error processing Excel file:', error.message);
    console.error('Error name:', error.name);
    console.error('Error stack:', error.stack);
    console.error('Final memory usage:', getMemoryStats());
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing Excel file',
        error: error.message,
        name: error.name,
        memoryUsage: getMemoryStats()
      })
    };
  }
};

/**
 * Clear all items from the DynamoDB table
 */
async function clearTable() {
  console.log('Clearing table:', INSTITUTIONS_SNIES_TABLE);
  try {
    // Scan all items in the table
    console.log('- Scanning existing items...');
    const scanStart = Date.now();
    const scanResult = await dynamoClient.send(new ScanCommand({
      TableName: INSTITUTIONS_SNIES_TABLE
    }));
    console.log(`- Scan completed in ${Date.now() - scanStart}ms`);
    console.log(`- Found ${scanResult.Items?.length || 0} existing items`);
    
    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log('- No items to delete, table is empty');
      return;
    }
    
    // Delete items in batches para mayor eficiencia
    const batchSize = 25; // DynamoDB permite 25 eliminaciones por lote
    let deletedCount = 0;
    let errorCount = 0;
    
    console.log(`- Deleting items in batches of ${batchSize}...`);
    const deleteStart = Date.now();
    
    // Agrupar elementos en lotes para la eliminación
    for (let i = 0; i < scanResult.Items.length; i += batchSize) {
      const batch = scanResult.Items.slice(i, i + batchSize);
      const deleteRequests = [];
      
      // Crear las solicitudes de eliminación para este lote
      for (const item of batch) {
        const unmarshalled = unmarshall(item);
        
        if (!unmarshalled.codigo) {
          console.warn('WARNING: Item has no codigo property:', JSON.stringify(unmarshalled, null, 2));
          errorCount++;
          continue;
        }
        
        deleteRequests.push({
          DeleteRequest: {
            Key: marshall({ codigo: unmarshalled.codigo })
          }
        });
      }
      
      if (deleteRequests.length > 0) {
        try {
          // Usar BatchWriteItem para eliminar múltiples elementos de una vez
          const result = await dynamoClient.send(new BatchWriteItemCommand({
            RequestItems: {
              [INSTITUTIONS_SNIES_TABLE]: deleteRequests
            }
          }));
          
          // Verificar si hay elementos no procesados
          const unprocessedCount = result.UnprocessedItems?.[INSTITUTIONS_SNIES_TABLE]?.length || 0;
          if (unprocessedCount > 0) {
            console.warn(`- WARNING: ${unprocessedCount} items were not deleted in this batch`);
            errorCount += unprocessedCount;
          }
          
          deletedCount += deleteRequests.length - unprocessedCount;
          
          // Registrar el progreso
          if (i % (batchSize * 4) === 0 || i + batchSize >= scanResult.Items.length) {
            console.log(`- Deleted ${deletedCount}/${scanResult.Items.length} items...`);
          }
        } catch (batchError) {
          console.error(`- ERROR deleting batch:`, batchError);
          errorCount += deleteRequests.length;
        }
      }
    }
    
    console.log(`- Table clearing completed in ${Date.now() - deleteStart}ms`);
    console.log(`- Cleared ${deletedCount} items from table ${INSTITUTIONS_SNIES_TABLE}`);
    if (errorCount > 0) {
      console.warn(`- WARNING: Failed to delete ${errorCount} items`);
    }
  } catch (error) {
    console.error('ERROR in clearTable function:');
    console.error('Name:', error.name);
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

/**
 * Check if a buffer is valid UTF-8
 */
function isValidUTF8(buffer) {
  try {
    buffer.toString('utf-8');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Obtener estadísticas de uso de memoria
 */
function getMemoryStats() {
  const memoryUsage = process.memoryUsage();
  return {
    rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
    percentageUsed: `${((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(2)}%`
  };
} 