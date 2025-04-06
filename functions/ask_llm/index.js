const { askLLM, getConversationHistory, saveConversationHistory } = require("./utils");

exports.handler = async (event, context) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { prompt, system_prompt, conversation_id, messages, model_options } = body;
    
    console.log("Received request with:", { 
      promptLength: prompt?.length, 
      systemPromptLength: system_prompt?.length,
      conversation_id,
      messagesCount: messages?.length,
      modelOptions: model_options
    });

    let conversationHistory = [];
    
    // Si hay un conversation_id, intentar recuperar el historial
    if (conversation_id) {
      try {
        conversationHistory = await getConversationHistory(conversation_id);
        console.log(`Retrieved conversation history for ${conversation_id}, ${conversationHistory.length} messages`);
      } catch (error) {
        console.error("Error retrieving conversation history:", error);
        // Continuar con historial vacío si hay error
      }
    }
    
    // Si se proporcionó historial de mensajes en la solicitud, usarlo
    if (messages && Array.isArray(messages) && messages.length > 0) {
      conversationHistory = messages;
      console.log("Using provided messages array as conversation history");
    }
    
    // Agregar el nuevo mensaje del usuario al historial
    conversationHistory.push({
      role: "user",
      content: prompt
    });
    
    // Preparar opciones para el modelo
    const llmOptions = {
      temperature: model_options?.temperature || 0.7,
      modelId: model_options?.modelId || 'amazon.nova-lite-v1:0'
    };
    
    console.log("LLM options:", llmOptions);
    
    // Llamar al modelo con el historial completo y el sistema de prompt
    // Añadimos el mensaje de sistema al principio
    const fullConversationHistory = [
      // Mensaje del sistema al inicio
      { role: "system", content: system_prompt },
      // Resto de la conversación
      ...conversationHistory
    ];
    
    console.log("Sending to LLM with conversation history of", fullConversationHistory.length, "messages");
    
    // La función askLLM ya manejará internamente el mensaje del sistema
    const askLlmResp = await askLLM(fullConversationHistory, llmOptions);
    
    // Agregar la respuesta del asistente al historial
    conversationHistory.push({
      role: "assistant",
      content: askLlmResp
    });
    
    // Si hay un conversation_id, guardar el historial actualizado
    if (conversation_id) {
      try {
        await saveConversationHistory(conversation_id, conversationHistory);
        console.log(`Saved updated conversation history for ${conversation_id}`);
      } catch (error) {
        console.error("Error saving conversation history:", error);
      }
    }
    
    // Generar un nuevo ID de conversación si no se proporcionó uno
    const new_conversation_id = conversation_id || `conv_${Date.now()}`;
    
    // Procesar la respuesta para detectar y limpiar recomendaciones de búsqueda si es necesario
    let cleanedResponse = askLlmResp;
    let searchRecommendation = null;
    
    // Buscar recomendación de búsqueda en el formato específico
    const searchMatch = askLlmResp.match(/BÚSQUEDA_RECOMENDADA:\s*(.*?)(?:\n|$)/);
    if (searchMatch && searchMatch[1]) {
      // Extraer la recomendación
      searchRecommendation = searchMatch[1].trim();
      
      // Opcionalmente, limpiar la recomendación del texto visible
      // Comentado porque es mejor mantenerlo visible en este caso
      // cleanedResponse = askLlmResp.replace(/BÚSQUEDA_RECOMENDADA:\s*(.*?)(?:\n|$)/, '').trim();
    }
    
    const response = {
      statusCode: 200,
      body: JSON.stringify({ 
        resp: cleanedResponse,
        conversation_id: new_conversation_id,
        message_count: conversationHistory.length,
        search_recommendation: searchRecommendation
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Access-Control-Allow-Origin',
        'Access-Control-Allow-Credentials': 'true'
      }
    };
    
    return response;
  } catch (error) {
    console.error("Error in handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Error processing request", 
        message: error.message 
      }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Access-Control-Allow-Origin',
        'Access-Control-Allow-Credentials': 'true'
      }
    };
  }
};
