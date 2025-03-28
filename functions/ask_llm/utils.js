const {
    BedrockRuntimeClient,
    InvokeModelCommand,
    ConverseCommand,
  } = require('@aws-sdk/client-bedrock-runtime')
  const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
  const { readFile } = require('fs/promises')
  
  const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' })
  const s3Client = new S3Client({ region: 'us-east-1' })
  
  /**
   * Read and process a local image file for Bedrock compatibility
   * @param {string} imagePath - Path to the local image file
   * @returns {Promise<{bytes: Buffer}>} Processed image data
   */
  async function readLocalImage(imagePath) {
    try {
      const imageBuffer = await readFile(imagePath)
      return {
        bytes: imageBuffer,
      }
    } catch (error) {
      throw new Error(`Failed to read local image: ${error.message}`)
    }
  }
  
  /**
   * Read and process an image from S3 for Bedrock compatibility
   * @param {string} bucket - S3 bucket name
   * @param {string} key - S3 object key
   * @returns {Promise<{bytes: Buffer}>} Processed image data
   */
  async function readS3Image(bucket, key) {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
  
      const response = await s3Client.send(command)
      const chunks = []
  
      for await (const chunk of response.Body) {
        chunks.push(chunk)
      }
  
      return {
        bytes: Buffer.concat(chunks),
      }
    } catch (error) {
      throw new Error(`Failed to read S3 image: ${error.message}`)
    }
  }
  
  /**
   * Send a prompt to Amazon Nova Lite model with optional image input
   * @param {string} prompt - The text prompt to send
   * @param {Object} options - Additional options
   * @param {Object} [options.image] - Optional image data
   * @param {string} [options.modelId='amazon.nova-lite-v1:0'] - Model ID to use
   * @param {number} [options.temperature=0.7] - Temperature for response generation
   * @returns {Promise<string>} The model's response
   */
  async function askLLM(prompt, options = {}) {
    const {
      image,
      modelId = 'amazon.nova-lite-v1:0', // nova lite
      // modelId = 'amazon.nova-pro-v1:0',
      // modelId = 'anthropic.claude-3-7-sonnet-20250219-v1:0',
      temperature = 0.7,
    } = options
  
    if (!image) {
      console.log('no image', image)
    } else {
      console.log('image', image)
    }
  
    // Prepare the request body
    const input = {
      modelId,
      messages: [
        {
          role: 'user',
          content: image
            ? [
                {
                  text: prompt,
                },
                {
                  image: {
                    format: 'jpeg',
                    source: {
                      bytes: image.bytes,
                    },
                  },
                },
              ]
            : [
                { text: prompt },
              ],
        },
      ],
      inferenceConfiguration: {
        temperature: temperature,
      },
    }
  
    try {
      const command = new ConverseCommand(input)
      console.log('input', input.messages)
      const response = await bedrockClient.send(command)
      console.log('llm res', response.output)
  
      // Parse the response
      if (response.output?.message?.content?.[0]?.text) {
        return response.output.message.content[0].text
      }
      throw new Error('Unexpected response format from Bedrock')
    } catch (error) {
      console.error(error)
      throw new Error(`Failed to get response from Bedrock: ${error.message}`)
    }
  }
  
  async function generateImage(prompt) {}
  
  async function generateVideo(prompt) {}
  
  
  
  
  async function getImageEmbedding(imageBuffer) {
    
    const input = {
      modelId: 'amazon.titan-embed-image-v1',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputImage: imageBuffer.toString('base64')
      })
    };
  
    const command = new InvokeModelCommand(input);
    const response = await bedrockClient.send(command);
    
    // Parse the response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.embedding;
  }
  
  async function compareImages(image1Buffer, image2Buffer) {
    // Get embeddings for both images
    const embedding1 = await getImageEmbedding(image1Buffer);
    const embedding2 = await getImageEmbedding(image2Buffer);
    
    // Calculate cosine similarity between embeddings
    const similarity = cosineSimilarity(embedding1, embedding2);
    return similarity;
  }
  
  
  function cosineSimilarity(vectorA, vectorB) {
      if (vectorA.length !== vectorB.length) {
          throw new Error('Vectors must have the same length');
      }
  
      // Calculate dot product (A·B)
      const dotProduct = vectorA.reduce((sum, a, i) => sum + a * vectorB[i], 0);
      
      // Calculate magnitudes (||A|| and ||B||)
      const magnitudeA = Math.sqrt(vectorA.reduce((sum, a) => sum + a * a, 0));
      const magnitudeB = Math.sqrt(vectorB.reduce((sum, b) => sum + b * b, 0));
      
      // Avoid division by zero
      if (magnitudeA === 0 || magnitudeB === 0) {
          return 0;
      }
      
      // Return cosine similarity
      return dotProduct / (magnitudeA * magnitudeB);
  }
  
  
  
  
  module.exports = {
    readLocalImage,
    readS3Image,
    askLLM,
    generateImage,
    generateVideo,
    getImageEmbedding,
    compareImages,
    cosineSimilarity,
  }
  
  // Example usage:
  /*
  const { askLLM, readLocalImage, readS3Image } = require('./askllm.js');
  
  // Using with local image
  const imageData = await readLocalImage('./path/to/image.jpg');
  const response = await askLLM("What's in this image?", { image: imageData });
  
  // Using with S3 image
  const s3ImageData = await readS3Image('my-bucket', 'path/to/image.jpg');
  const response = await askLLM("What's in this image?", { image: s3ImageData });
  
  // Using without image
  const response = await askLLM("Tell me a joke");
  */