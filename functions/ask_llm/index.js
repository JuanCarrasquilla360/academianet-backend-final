const { askLLM } = require("./utils");

exports.handler = async (event, context) => {
  const body = event.body ? JSON.parse(event.body) : {};
  const { name } = body;
  const askLlmResp = await askLLM(name)
  const response = {
    statusCode: 200,
    body: JSON.stringify(askLlmResp),
  };
  return response;
};
