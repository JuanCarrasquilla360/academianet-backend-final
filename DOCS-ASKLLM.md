# Documentación: API de Chat con Memoria para Orientación Académica

## Introducción

El endpoint `/ask-llm` proporciona una interfaz de chat con memoria, basada en Amazon Bedrock. Este servicio está diseñado específicamente para asistencia en orientación académica, manteniendo el contexto de la conversación entre mensajes y ofreciendo recomendaciones de búsqueda basadas en las preferencias del usuario.

## URL del Endpoint

```
https://hdvcvqqro4.execute-api.us-east-1.amazonaws.com/dev/ask-llm
```

## Método

`POST`

## Parámetros de Solicitud

El cuerpo de la solicitud debe ser un objeto JSON con los siguientes campos:

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `prompt` | String | Sí | El mensaje actual del usuario |
| `system_prompt` | String | Sí | Instrucciones para el asistente sobre cómo comportarse |
| `conversation_id` | String | No | ID de conversación para continuar una conversación existente |
| `messages` | Array | No | Array de mensajes previos (alternativa a `conversation_id`) |
| `model_options` | Object | No | Opciones para configurar el modelo de IA |

### Estructura de `model_options`

| Parámetro | Tipo | Valor Predeterminado | Descripción |
|-----------|------|---------------------|-------------|
| `temperature` | Number | 0.7 | Controla la aleatoriedad de las respuestas (0.0 - 1.0) |
| `modelId` | String | "amazon.nova-lite-v1:0" | ID del modelo de Amazon Bedrock a utilizar |

### Estructura de `messages`

Si proporcionas un array de `messages`, cada mensaje debe tener la siguiente estructura:

```json
{
  "role": "user" | "assistant",
  "content": "texto del mensaje"
}
```

**Nota importante**: Aunque el prompt del sistema se maneja internamente como un mensaje con `role: "system"`, el servicio se encarga de convertirlo a un formato compatible con Bedrock. No incluyas mensajes con `role: "system"` en el array de `messages`.

## Ejemplo de Solicitud

### Primera interacción (sin conversation_id)

```json
{
  "prompt": "Estoy interesado en estudiar algo relacionado con tecnología en Medellín",
  "system_prompt": "Actúa como un orientador vocacional especializado en guiar a personas que están explorando opciones académicas en universidades de Medellín, Colombia...",
  "model_options": {
    "temperature": 0.7
  }
}
```

### Mensaje de seguimiento (con conversation_id)

```json
{
  "prompt": "Me gusta mucho la programación y las matemáticas",
  "system_prompt": "Actúa como un orientador vocacional especializado en guiar a personas...",
  "conversation_id": "conv_1234567890",
  "model_options": {
    "temperature": 0.7
  }
}
```

## Respuesta

La respuesta es un objeto JSON con los siguientes campos:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `resp` | String | La respuesta generada por el asistente |
| `conversation_id` | String | ID único para esta conversación (guardar para futuras interacciones) |
| `message_count` | Number | Número total de mensajes en la conversación |
| `search_recommendation` | String | Términos de búsqueda sugeridos (si el asistente los generó) |

### Ejemplo de Respuesta

```json
{
  "resp": "¡Hola! Gracias por compartir tu interés en el área de tecnología en Medellín. Es un excelente campo con muchas oportunidades. Para poder orientarte mejor, me gustaría saber un poco más sobre tus preferencias específicas dentro de la tecnología. ¿Te interesa más el desarrollo de software, las redes, la inteligencia artificial, la ciberseguridad u otra área en particular?",
  "conversation_id": "conv_1687453921234",
  "message_count": 2,
  "search_recommendation": null
}
```

## Gestión de Errores

| Código | Descripción |
|--------|-------------|
| 200 | Éxito |
| 400 | Error en los parámetros de la solicitud |
| 500 | Error interno del servidor |

### Ejemplo de Error

```json
{
  "error": "Error processing request",
  "message": "Descripción específica del error"
}
```

## Ejemplo de Uso desde JavaScript

```javascript
// Función para enviar un mensaje al asistente
async function sendMessage(prompt, systemPrompt, conversationId = null) {
  try {
    const response = await fetch('https://hdvcvqqro4.execute-api.us-east-1.amazonaws.com/dev/ask-llm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        system_prompt: systemPrompt,
        conversation_id: conversationId,
        model_options: {
          temperature: 0.7,
          modelId: 'amazon.nova-lite-v1:0'
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Ejemplo de uso
async function chatWithAssistant() {
  // System prompt para orientación académica
  const systemPrompt = `Actúa como un orientador vocacional especializado en guiar a personas que están explorando opciones académicas en universidades de Medellín, Colombia...`;
  
  // Primer mensaje (sin conversation_id)
  const firstResponse = await sendMessage(
    "Hola, estoy buscando opciones para estudiar en Medellín", 
    systemPrompt
  );
  
  console.log("Respuesta:", firstResponse.resp);
  
  // Guardar el ID de conversación para futuros mensajes
  const conversationId = firstResponse.conversation_id;
  
  // Mensaje de seguimiento (con conversation_id)
  const followUpResponse = await sendMessage(
    "Me interesan las carreras relacionadas con programación", 
    systemPrompt, 
    conversationId
  );
  
  console.log("Respuesta de seguimiento:", followUpResponse.resp);
  
  // Verificar si hay una recomendación de búsqueda
  if (followUpResponse.search_recommendation) {
    console.log("Términos de búsqueda recomendados:", followUpResponse.search_recommendation);
    // Aquí podrías implementar la lógica para realizar la búsqueda
  }
}
```

## Prompt de Sistema Recomendado

Para obtener mejores resultados, se recomienda utilizar un prompt del sistema específico para orientación académica. Aquí hay un ejemplo:

```
Actúa como un orientador vocacional especializado en guiar a personas que están explorando opciones académicas en universidades de Medellín, Colombia. Tu objetivo es comprender los intereses, habilidades y aspiraciones del usuario, y con base en esta información, recomendar programas académicos que podrían ser adecuados para él o ella.

Tienes acceso a una base de datos estructurada que contiene información detallada sobre instituciones educativas y los programas académicos que estas ofrecen. Cuando el usuario te proporcione información relevante sobre sus gustos, intereses o aspiraciones profesionales, debes traducir esas respuestas en filtros o parámetros que pueden ser utilizados para consultar dicha base de datos y ofrecer sugerencias relevantes.

Haz preguntas abiertas y conversacionales para descubrir:
- Áreas de interés (por ejemplo: salud, tecnología, arte, negocios, etc.)
- Preferencias personales (por ejemplo: trabajo en equipo, investigación, creatividad, etc.)
- Habilidades (por ejemplo: lógica matemática, expresión oral, liderazgo, etc.)
- Expectativas laborales (por ejemplo: trabajar en empresas, emprendimiento, trabajo social, etc.)

Conserva el historial del chat para tener en cuenta el contexto de la conversación y refinar tus preguntas o recomendaciones. No repitas preguntas si ya has obtenido esa información en un mensaje anterior.

Siempre responde en un tono cálido, motivador y amigable. Tu propósito es orientar y empoderar al usuario en su proceso de elección académica.

Cuando identifiques que tienes suficiente información para hacer una recomendación específica, incluye al final de tu respuesta un formato exactamente así:
BÚSQUEDA_RECOMENDADA: [términos de búsqueda precisos]
```

## Mejores Prácticas

1. **Mantén el mismo system_prompt**: Envía siempre el mismo prompt del sistema en cada solicitud para mantener la coherencia en el comportamiento del asistente.

2. **Gestiona el conversation_id**: Guarda el `conversation_id` devuelto por el servidor y úsalo en futuros mensajes para mantener el contexto.

3. **Manejo de errores**: Implementa una lógica robusta de manejo de errores y reintentos, especialmente para errores temporales de red.

4. **Interfaz de usuario**: Proporciona indicadores visuales (como un spinner) durante la espera de respuestas, ya que pueden tardar unos segundos.

5. **Detección de recomendaciones**: Implementa lógica para detectar y utilizar el campo `search_recommendation` cuando esté presente.

## Limitaciones y Consideraciones

1. **Tiempos de respuesta**: Las respuestas pueden tardar entre 3 y 10 segundos dependiendo de la longitud del historial de conversación.

2. **Tamaño del historial**: Aunque el sistema maneja internamente el historial, existe un límite práctico en la cantidad de mensajes que puede procesar eficientemente (~20 mensajes).

3. **Cuotas y costos**: El servicio utiliza Amazon Bedrock, que tiene costos asociados por token procesado. Se recomienda implementar mecanismos para evitar abusos.

4. **Persistencia**: Las conversaciones se almacenan indefinidamente. Si necesitas implementar políticas de retención de datos, consulta con el equipo de desarrollo.

## Soporte

Para problemas técnicos o preguntas sobre la integración, contacta al equipo de desarrollo de AcademiaNet.

---

Última actualización: Julio 2024 