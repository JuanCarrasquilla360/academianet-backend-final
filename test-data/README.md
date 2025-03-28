# Instrucciones para la carga de archivos Excel a DynamoDB

Este documento proporciona instrucciones para cargar datos desde archivos Excel a la tabla DynamoDB `instituciones_snies`.

## Requisitos previos

1. Asegúrate de que la infraestructura esté desplegada usando CDK
2. Instala las dependencias de los scripts: `cd scripts && npm install`
3. Configura tus credenciales de AWS correctamente

## Estructura del archivo Excel

El archivo Excel debe tener las siguientes columnas (pueden estar en mayúsculas o minúsculas):

- `codigo` o `CODIGO`: Código único de la institución (obligatorio)
- `nombre` o `NOMBRE`: Nombre de la institución
- `caracter` o `CARACTER`: Carácter de la institución
- `naturaleza` o `NATURALEZA`: Naturaleza jurídica
- `sector` o `SECTOR`: Sector (público/privado)
- `departamento` o `DEPARTAMENTO`: Departamento donde se encuentra 
- `municipio` o `MUNICIPIO`: Municipio donde se encuentra
- `direccion` o `DIRECCION`: Dirección física
- `telefono` o `TELEFONO`: Número de teléfono

## Configuración manual post-despliegue

Después de desplegar el stack de CDK, debes ejecutar estos comandos (disponibles en las salidas del stack):

1. Conceder permiso a S3 para invocar Lambda:
   ```
   aws lambda add-permission --function-name <nombre-funcion> --statement-id AllowS3Invoke --action lambda:InvokeFunction --principal s3.amazonaws.com --source-arn <arn-bucket>
   ```

2. Configurar la notificación del bucket S3:
   ```
   aws s3api put-bucket-notification-configuration --bucket <nombre-bucket> --notification-configuration '{"LambdaFunctionConfigurations":[{"LambdaFunctionArn":"<arn-lambda>","Events":["s3:ObjectCreated:*"],"Filter":{"Key":{"FilterRules":[{"Name":"prefix","Value":"uploads/"},{"Name":"suffix","Value":".xlsx"}]}}}]}'
   ```

## Cómo subir un archivo Excel

### Opción 1: Usando AWS Management Console

1. Inicia sesión en la consola de AWS
2. Navega al servicio S3
3. Busca y selecciona el bucket creado por el stack
4. Crea una carpeta `uploads` si no existe
5. Sube tu archivo Excel a esta carpeta

### Opción 2: Usando AWS CLI

Ejecuta el siguiente comando:
```
aws s3 cp tu-archivo.xlsx s3://<nombre-bucket>/uploads/
```

### Opción 3: Usando nuestro script de prueba

Ejecuta:
```
node scripts/test-excel-upload.js <nombre-bucket> ./ruta/a/tu-archivo.xlsx
```

## Depuración de problemas

Si experimentas problemas, puedes:

1. Verificar los logs de la función Lambda:
   ```
   aws logs tail /aws/lambda/<nombre-funcion> --follow
   ```

2. Comprobar que la tabla DynamoDB existe:
   ```
   aws dynamodb describe-table --table-name instituciones_snies
   ```

3. Verificar la configuración de notificación del bucket:
   ```
   aws s3api get-bucket-notification-configuration --bucket <nombre-bucket>
   ```

4. Verificar los permisos de la función Lambda:
   ```
   aws lambda get-policy --function-name <nombre-funcion>
   ```

## Formato de datos de ejemplo

```json
{
  "codigo": "1234",
  "nombre": "Universidad Ejemplo",
  "caracter": "Universidad",
  "naturaleza": "Privada",
  "sector": "Privado",
  "departamento": "Antioquia",
  "municipio": "Medellín",
  "direccion": "Calle 123 #45-67",
  "telefono": "601 234 5678"
}
``` 