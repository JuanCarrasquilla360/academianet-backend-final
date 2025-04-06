# Documentación del Asistente Virtual de Orientación Académica

Este documento explica el funcionamiento y la implementación del asistente virtual de orientación académica integrado en AcademiaNet. El asistente está diseñado para brindar asesoría personalizada a estudiantes que buscan orientación sobre programas académicos en Medellín.

## Características Principales

- **Historial de Conversación Persistente**: Las conversaciones se almacenan en DynamoDB para mantener el contexto entre sesiones.
- **Sistema de Recomendaciones**: Detecta automáticamente cuándo recomendar programas académicos basados en las preferencias del usuario.
- **Integración con Amazon Bedrock**: Utiliza modelos avanzados de IA para generar respuestas contextuales y relevantes.

## Arquitectura del Sistema

### Backend (AWS Lambda)

El backend del asistente virtual está implementado como una función Lambda llamada `ask_llm` que interactúa con Amazon Bedrock y almacena las conversaciones en DynamoDB.

#### Componentes Principales

1. **Handler (index.js)**: 
   - Recibe y procesa las solicitudes HTTP
   - Gestiona el historial de conversaciones
   - Envía las respuestas formateadas

2. **Utilitarios (utils.js)**:
   - `askLLM`: Comunica con Amazon Bedrock
   - `saveConversationHistory`: Guarda el historial en DynamoDB
   - `getConversationHistory`: Recupera el historial de DynamoDB

3. **Almacenamiento**:
   - Tabla DynamoDB `Conversations` para persistencia de datos
   - Sistema de caché en memoria para desarrollo/pruebas

### Flujo de Datos

1. El usuario envía un mensaje desde el frontend
2. El Lambda recupera el historial de conversación (si existe)
3. Agrega el nuevo mensaje al historial
4. Envía la conversación completa al modelo de IA con un prompt de sistema
5. Recibe la respuesta del modelo
6. Detecta si hay recomendaciones de búsqueda
7. Almacena la conversación actualizada
8. Devuelve la respuesta con el ID de conversación

## Implementación

### Formato de Solicitud

```json
{
  "prompt": "¿Qué carreras hay en el área de tecnología?",
  "system_prompt": "Actúa como un orientador vocacional especializado...",
  "conversation_id": "conv_1234567890",
  "messages": [
    { "role": "user", "content": "Me gustan las matemáticas" },
    { "role": "assistant", "content": "¡Excelente! Las matemáticas..." }
  ]
}
```

### Formato de Respuesta

```json
{
  "resp": "Basado en tu interés en las matemáticas...",
  "conversation_id": "conv_1234567890",
  "message_count": 4,
  "search_recommendation": "ingeniería sistemas medellín"
}
```

## Prompt de Sistema

El sistema utiliza un prompt diseñado específicamente para orientación académica en Medellín:

```
Actúa como un orientador vocacional especializado en guiar a personas que están explorando opciones académicas en universidades de Medellín, Colombia. Tu objetivo es comprender los intereses, habilidades y aspiraciones del usuario, y con base en esta información, recomendar programas académicos que podrían ser adecuados para él o ella.

Tienes acceso a una base de datos estructurada que contiene información detallada sobre instituciones educativas y los programas académicos que estas ofrecen. Cuando el usuario te proporcione información relevante sobre sus gustos, intereses o aspiraciones profesionales, debes traducir esas respuestas en filtros o parámetros que pueden ser utilizados para consultar dicha base de datos y ofrecer sugerencias relevantes.

Haz preguntas abiertas y conversacionales para descubrir:
- Áreas de interés (por ejemplo: salud, tecnología, arte, negocios, etc.)
- Preferencias personales (por ejemplo: trabajo en equipo, investigación, creatividad, etc.)
- Habilidades (por ejemplo: lógica matemática, expresión oral, liderazgo, etc.)
- Expectativas laborales (por ejemplo: trabajar en empresas, emprendimiento, trabajo social, etc.)

Al final de este proceso, genera un conjunto de parámetros como: área de conocimiento, nivel educativo, tipo de carrera, y cualquier otro criterio útil, que pueda ser enviado a un endpoint para obtener programas académicos sugeridos.

Conserva el historial del chat para tener en cuenta el contexto de la conversación y refinar tus preguntas o recomendaciones. No repitas preguntas si ya has obtenido esa información en un mensaje anterior.

Siempre responde en un tono cálido, motivador y amigable. Tu propósito es orientar y empoderar al usuario en su proceso de elección académica.

Cuando identifiques que tienes suficiente información para hacer una recomendación específica, incluye al final de tu respuesta un formato exactamente así:
BÚSQUEDA_RECOMENDADA: [términos de búsqueda precisos]
```

## Instrucciones de Uso (Frontend)

Para integrar este servicio en una aplicación frontend, se debe utilizar el `chatService` proporcionado. Este servicio gestiona toda la comunicación con el backend y mantiene el historial de conversación.

### Ejemplo de Uso en React

```javascript
import { chatService, SYSTEM_PROMPTS } from '../../services/chatService';

// Estado para el ID de conversación
const [conversationId, setConversationId] = useState<string | undefined>(undefined);

// Función para enviar mensaje
const sendMessage = async (message: string) => {
  try {
    const response = await chatService.sendMessage(
      message,
      SYSTEM_PROMPTS.ACADEMIC_ADVISOR,
      { conversation_id: conversationId }
    );
    
    // Guardar el ID de conversación para futuros mensajes
    setConversationId(response.conversation_id);
    
    // Procesar la respuesta
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: response.response,
      sender: 'bot',
      timestamp: new Date()
    }]);
    
    // Verificar si hay recomendación de búsqueda
    if (response.search_recommendation) {
      // Implementar lógica para mostrar recomendación
      onSearchRequest(response.search_recommendation);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

## Notas de Implementación

1. **DynamoDB**: 
   - Asegúrate de que la tabla `Conversations` esté creada antes de usar el chat
   - Usa el script `scripts/create_conversations_table.js` para crearla

2. **Variables de Entorno**:
   - `CONVERSATION_STORAGE_TYPE`: Tipo de almacenamiento ('memory', 's3', 'dynamodb')
   - `CONVERSATION_TABLE`: Nombre de la tabla DynamoDB (default: 'Conversations')

3. **Seguridad**:
   - Implementa autenticación para proteger las conversaciones de los usuarios
   - Considera un sistema de TTL (Time-to-Live) para las conversaciones en DynamoDB

## Personalización

Para personalizar el comportamiento del asistente:

1. **Modificar el Prompt**: Cambia el prompt del sistema para adaptarlo a tus necesidades
2. **Configuración del Modelo**:
   - Ajusta el parámetro `temperature` para controlar la creatividad de las respuestas
   - Cambia el modelo de Bedrock según tus necesidades

```javascript
// Mayor creatividad
chatService.sendMessage(message, prompt, { temperature: 0.9 });

// Respuestas más consistentes
chatService.sendMessage(message, prompt, { temperature: 0.2 });
```

## Recomendaciones para Frontend

1. Agregar un indicador visual mientras se espera la respuesta
2. Implementar persistencia local del historial de conversación
3. Permitir al usuario reiniciar la conversación
4. Mostrar sugerencias de preguntas para iniciar la conversación

## Solución de Problemas Comunes

- **Respuestas Lentas**: Asegúrate de tener un timeout adecuado en tus solicitudes HTTP
- **Pérdida de Contexto**: Verifica que el `conversation_id` se esté enviando correctamente
- **Límites de Uso**: Ten en cuenta los límites de Amazon Bedrock para evitar costos excesivos

## Conclusión

El asistente virtual de orientación académica proporciona una experiencia conversacional fluida y contextualmente relevante para los usuarios. Mantiene el historial de la conversación para ofrecer respuestas personalizadas y genera recomendaciones de búsqueda basadas en las preferencias detectadas. 