const { askLLM } = require("./utils");

exports.handler = async (event, context) => {
  const body = event.body ? JSON.parse(event.body) : {};
  const { prompt, system_prompt } = body;
  const fullPrompt = `${system_prompt}${prompt}`
  const askLlmResp = await askLLM(fullPrompt)
  const response = {
    statusCode: 200,
    body: JSON.stringify({ resp: askLlmResp }),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Access-Control-Allow-Origin',
      'Access-Control-Allow-Credentials': 'true'
    }
  };
  return response;
};
