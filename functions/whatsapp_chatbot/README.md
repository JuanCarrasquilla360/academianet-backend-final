# WhatsApp Chatbot with Amazon Bedrock

Este es un POC (Proof of Concept) que integra WhatsApp a través de Twilio con Amazon Bedrock para crear un asistente académico vía WhatsApp.

## Requisitos Previos

1. Cuenta de Twilio
2. Cuenta de AWS con acceso a Amazon Bedrock
3. Un número de teléfono de WhatsApp de Twilio

## Configuración de Twilio

### Paso 1: Crear una cuenta de Twilio

1. Regístrate en [Twilio](https://www.twilio.com/try-twilio)
2. Verifica tu correo electrónico y completa el proceso de registro

### Paso 2: Activar WhatsApp Sandbox

1. Ve a [Messaging > Try it out > Send a WhatsApp Message](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn) en la consola de Twilio
2. Sigue las instrucciones para activar el sandbox de WhatsApp:
   - Envía un mensaje de WhatsApp con el código proporcionado al número indicado
   - Esto conectará tu WhatsApp con el sandbox de Twilio

### Paso 3: Configurar el webhook

1. Una vez desplegado el backend en AWS, copia la URL del webhook de WhatsApp (formato: `https://xxxxx.execute-api.region.amazonaws.com/dev/whatsapp-webhook`)
2. En la consola de Twilio, ve a Messaging > Settings > WhatsApp Sandbox Settings
3. En "When a message comes in", pega la URL del webhook
4. Asegúrate de seleccionar "HTTP POST" como método

## Configuración de AWS

### Paso 1: Configurar las credenciales de Twilio

Debes configurar las siguientes variables de entorno para la función Lambda antes de desplegar:

```bash
# Exportar variables de entorno para el despliegue de CDK
export TWILIO_ACCOUNT_SID=tu_account_sid
export TWILIO_AUTH_TOKEN=tu_auth_token
export TWILIO_PHONE_NUMBER=+14155238886  # O el número que te proporciona Twilio
```

Alternativamente, puedes configurar estas variables directamente en el panel de Lambda después del despliegue.

### Paso 2: Desplegar la aplicación

```bash
npm run build
cdk deploy
```

### Paso 3: Verificar la configuración

Una vez desplegada la aplicación, asegúrate de que:

1. La función Lambda `handleWhatsappChatbot` se ha creado correctamente
2. Las variables de entorno están correctamente configuradas
3. El endpoint API Gateway `/whatsapp-webhook` está activo

## Probar la integración

1. Envía un mensaje desde tu WhatsApp al número de sandbox de Twilio
2. Deberías recibir una respuesta generada por Amazon Bedrock
3. Revisa los logs de CloudWatch para depurar cualquier problema

## Estructura del Código

- `index.js`: Punto de entrada que maneja las solicitudes de Twilio y la respuesta
- `utils.js`: Contiene la integración con Amazon Bedrock
- `package.json`: Define las dependencias del proyecto

## Limitaciones del POC

Este POC no incluye:

1. Persistencia de historial de conversación (cada mensaje es independiente)
2. Autenticación de usuarios
3. Manejo de imágenes o archivos
4. Limitación de tasa o cuotas

## Personalización

Puedes personalizar el comportamiento del chatbot modificando:

- El `SYSTEM_PROMPT` en `index.js` para cambiar la personalidad o conocimientos del asistente
- Los parámetros del modelo como `temperature` para ajustar la creatividad de las respuestas
- El modelo de Bedrock utilizado, cambiando `modelId` en las opciones

## Próximos Pasos

Para convertir este POC en una solución más robusta, considera:

1. Implementar persistencia de historial de conversación por usuario
2. Añadir autenticación para el webhook de Twilio
3. Implementar un sistema de feedback para mejorar las respuestas
4. Añadir análisis de sentimiento para adaptar respuestas
5. Configurar administración de usuarios y asignación de números
6. Integrar con la base de conocimientos específica de la institución

## Soporte

Para cualquier problema o pregunta, revisa los logs de CloudWatch o contacta al equipo de desarrollo. 