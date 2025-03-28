const AWS = require('aws-sdk');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // Initialize S3 client
  const s3 = new AWS.S3();
  
  // Extract parameters from event
  const { RequestType, ResourceProperties } = event;
  const { BucketName, LambdaArn, Events, Filter } = ResourceProperties;
  
  // Prepare response
  const response = {
    Status: 'SUCCESS',
    PhysicalResourceId: `${BucketName}-S3NotificationConfig`,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: {}
  };
  
  try {
    if (RequestType === 'Create' || RequestType === 'Update') {
      // Get the Lambda function's invoke permission
      const lambda = new AWS.Lambda();
      
      // Add permission for S3 to invoke the Lambda function if it doesn't exist
      try {
        const statementId = `AllowS3Invoke-${BucketName}`;
        await lambda.addPermission({
          Action: 'lambda:InvokeFunction',
          FunctionName: LambdaArn,
          Principal: 's3.amazonaws.com',
          SourceArn: `arn:aws:s3:::${BucketName}`,
          StatementId: statementId
        }).promise();
        console.log('Added Lambda invoke permission');
      } catch (error) {
        // If the permission already exists, ignore the error
        if (error.code !== 'ResourceConflictException') {
          throw error;
        }
        console.log('Lambda invoke permission already exists');
      }
      
      // Configure S3 notification
      const notificationConfig = {
        LambdaFunctionConfigurations: [
          {
            Events: Events,
            LambdaFunctionArn: LambdaArn,
            Filter: Filter
          }
        ]
      };
      
      await s3.putBucketNotificationConfiguration({
        Bucket: BucketName,
        NotificationConfiguration: notificationConfig
      }).promise();
      
      console.log('Successfully configured S3 notification');
    } else if (RequestType === 'Delete') {
      // Remove the S3 notification configuration
      await s3.putBucketNotificationConfiguration({
        Bucket: BucketName,
        NotificationConfiguration: {}
      }).promise();
      
      console.log('Successfully removed S3 notification configuration');
    }
    
    // Send response back to CloudFormation
    return response;
  } catch (error) {
    console.error('Error:', error);
    response.Status = 'FAILED';
    response.Reason = error.message;
    return response;
  }
}; 