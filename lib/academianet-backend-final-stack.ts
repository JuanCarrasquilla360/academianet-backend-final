import * as cdk from "aws-cdk-lib";
import {
  StringAttribute,
  UserPool,
  UserPoolClient,
  VerificationEmailStyle,
} from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { RestApiConstruct, FunctionConstruct } from "devarchy-cdk";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AcademianetBackendFinalStack extends cdk.Stack {
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  institutionsTable: dynamodb.Table;
  institutionsSniesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const api = new RestApiConstruct(this, "academianetApi");

    // Create DynamoDB table for institutions
    this.createDynamoTable();

    // Set up authentication
    this.setUpAuth();

    // Set up S3 bucket and Lambda trigger
    this.setupS3BucketAndLambdaTrigger();

    // Set up Lambda functions
    const handleGetInstitutions = new FunctionConstruct(
      this,
      "handleGetInstitutions"
    );
    handleGetInstitutions.createLayer("sdkLayer", "./layers/sdk-lib");
    handleGetInstitutions.code("./functions/get_institutions");

    // Set environment variables for the get_institutions function
    handleGetInstitutions.handlerFn.addEnvironment(
      "INSTITUTIONS_TABLE",
      this.institutionsTable.tableName
    );

    // Create registration Lambda function
    const handleRegisterInstitution = new FunctionConstruct(
      this,
      "handleRegisterInstitution"
    );
    handleRegisterInstitution.useLayer("sdkLayer");
    handleRegisterInstitution.code("./functions/register_institution");

    // Set environment variables for the Lambda function
    handleRegisterInstitution.handlerFn.addEnvironment(
      "USER_POOL_ID",
      this.userPool.userPoolId
    );
    handleRegisterInstitution.handlerFn.addEnvironment(
      "USER_POOL_CLIENT_ID",
      this.userPoolClient.userPoolClientId
    );
    handleRegisterInstitution.handlerFn.addEnvironment(
      "INSTITUTIONS_TABLE",
      this.institutionsTable.tableName
    );

    // Create email verification Lambda function
    const handleVerifyEmail = new FunctionConstruct(this, "handleVerifyEmail");
    handleVerifyEmail.useLayer("sdkLayer");
    handleVerifyEmail.code("./functions/verify_email");

    // Set environment variables for the verification function
    handleVerifyEmail.handlerFn.addEnvironment(
      "USER_POOL_CLIENT_ID",
      this.userPoolClient.userPoolClientId
    );
    handleVerifyEmail.handlerFn.addEnvironment(
      "INSTITUTIONS_TABLE",
      this.institutionsTable.tableName
    );

    // Create resend verification code Lambda function
    const handleResendVerificationCode = new FunctionConstruct(
      this,
      "handleResendVerificationCode"
    );
    handleResendVerificationCode.useLayer("sdkLayer");
    handleResendVerificationCode.code("./functions/resend_verification_code");

    // Set environment variables for the resend verification function
    handleResendVerificationCode.handlerFn.addEnvironment(
      "USER_POOL_CLIENT_ID",
      this.userPoolClient.userPoolClientId
    );

    const handleAskLlm = new FunctionConstruct(this, "handleAskLlm");
    handleAskLlm.useLayer("sdkLayer");
    handleAskLlm.code("./functions/ask_llm");

    // Configurar variables de entorno para el almacenamiento de conversaciones
    handleAskLlm.handlerFn.addEnvironment(
      "CONVERSATION_STORAGE_TYPE",
      "dynamodb" // Usar DynamoDB para almacenamiento permanente
    );
    handleAskLlm.handlerFn.addEnvironment(
      "CONVERSATION_TABLE",
      "Conversations"
    );

    // Create WhatsApp chatbot Lambda function
    const handleWhatsappChatbot = new FunctionConstruct(this, "handleWhatsappChatbot");
    handleWhatsappChatbot.useLayer("sdkLayer");
    handleWhatsappChatbot.code("./functions/whatsapp_chatbot");
    
    // Set environment variables for the WhatsApp chatbot function (to be set in the deployment process)
    handleWhatsappChatbot.handlerFn.addEnvironment(
      "TWILIO_ACCOUNT_SID",
      process.env.TWILIO_ACCOUNT_SID || "AC04ab387adc4bff0b4c4f53e2c63e3e6e"
    );
    handleWhatsappChatbot.handlerFn.addEnvironment(
      "TWILIO_AUTH_TOKEN",
      process.env.TWILIO_AUTH_TOKEN || "bcf328f3d82012a351cd27262cde59c3"
    );
    handleWhatsappChatbot.handlerFn.addEnvironment(
      "TWILIO_PHONE_NUMBER",
      process.env.TWILIO_PHONE_NUMBER || "+14155238886"
    );

    // Create new Lambda function for getting institutions from Excel data
    const handleGetExcelInstitutions = new FunctionConstruct(
      this,
      "handleGetExcelInstitutions"
    );
    handleGetExcelInstitutions.useLayer("sdkLayer");
    handleGetExcelInstitutions.code("./functions/get_excel_institutions");

    // Set environment variables for the get_excel_institutions function
    handleGetExcelInstitutions.handlerFn.addEnvironment(
      "INSTITUTIONS_TABLE",
      "Instituciones" // This is the table name from excel_to_dynamo.js
    );

    // Create new Lambda function for getting academic programs from Excel data
    const handleGetAcademicPrograms = new FunctionConstruct(
      this,
      "handleGetAcademicPrograms"
    );
    handleGetAcademicPrograms.useLayer("sdkLayer");
    handleGetAcademicPrograms.code("./functions/get_academic_programs");

    // Set environment variables for the get_academic_programs function
    handleGetAcademicPrograms.handlerFn.addEnvironment(
      "PROGRAMS_TABLE",
      "ProgramasAcademicos" // This is the table name from excel_to_dynamo.js
    );

    // Add this near your other Lambda function configurations
    const bedrockPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListFoundationModels",
        "bedrock:GetFoundationModel",
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/*`,
        `arn:aws:bedrock:*::foundation-model/*`,
      ],
    });

    handleAskLlm.handlerFn.addToRolePolicy(bedrockPolicy as any);
    
    // Also add Bedrock permissions to WhatsApp chatbot function
    handleWhatsappChatbot.handlerFn.addToRolePolicy(bedrockPolicy as any);

    // If you need to use specific models, you can also be more explicit with the ARNs:
    const specificModelPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      resources: [
        `arn:aws:bedrock:*`,
      ],
    });

    handleAskLlm.handlerFn.addToRolePolicy(specificModelPolicy as any);
    handleWhatsappChatbot.handlerFn.addToRolePolicy(specificModelPolicy as any);

    const handleSubmitApplication = new FunctionConstruct(this, "handleSubmitApplication");
    handleSubmitApplication.useLayer("sdkLayer");
    handleSubmitApplication.code("./functions/submit_application");

    handleSubmitApplication.handlerFn.addEnvironment(
      "APPLICATIONS_TABLE",
      "Applications"
    );

    // Add SES permissions for sending emails
    const sesPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      resources: ["*"]
    });

    handleSubmitApplication.handlerFn.addToRolePolicy(sesPolicy as any);

    // Set up API endpoints with enhanced CORS
    api.cors(); 

    // Create routes
    api.get("/institutions")?.fn(handleGetInstitutions.handlerFn);
    api.post("/register")?.fn(handleRegisterInstitution.handlerFn);
    api.post("/verify-email")?.fn(handleVerifyEmail.handlerFn);
    api
      .post("/resend-verification-code")
      ?.fn(handleResendVerificationCode.handlerFn);
    api.post("/ask-llm")?.fn(handleAskLlm.handlerFn);
    api.get("/excel-institutions")?.fn(handleGetExcelInstitutions.handlerFn);
    api.get("/academic-programs")?.fn(handleGetAcademicPrograms.handlerFn);
    api.post("/whatsapp-webhook")?.fn(handleWhatsappChatbot.handlerFn);
    // Add new endpoint for application submissions
    api.post("/submit-application")?.fn(handleSubmitApplication.handlerFn);

    // Also explicitly add OPTIONS methods to ensure proper CORS preflight handling
    api.options("/institutions");
    api.options("/register");
    api.options("/verify-email");
    api.options("/resend-verification-code");
    api.options("/ask-llm");
    api.options("/excel-institutions");
    api.options("/academic-programs");
    api.options("/whatsapp-webhook");
    api.options("/submit-application");

    // Grant permissions after setting up the API
    this.grantPermissions(handleRegisterInstitution);
    this.grantPermissions(handleVerifyEmail);
    this.grantPermissions(handleResendVerificationCode);
    this.grantPermissions(handleAskLlm);
    this.grantPermissions(handleWhatsappChatbot);
    this.grantPermissions(handleSubmitApplication);
    this.grantDynamoPermissions(handleGetInstitutions);
    this.grantDynamoPermissions(handleGetExcelInstitutions);
    this.grantDynamoPermissions(handleGetAcademicPrograms);

    // Output the API Gateway endpoint URL
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: api.api.url, // Access the underlying API Gateway instance
      description: "API Gateway endpoint URL",
    });
    
    // Output the WhatsApp webhook URL
    new cdk.CfnOutput(this, "WhatsAppWebhookUrl", {
      value: `${api.api.url}whatsapp-webhook`,
      description: "WhatsApp webhook URL for Twilio configuration",
    });
  }

  grantPermissions(lambdaFunction: FunctionConstruct) {
    // Grant DynamoDB permissions
    const tableArn = this.institutionsTable.tableArn;
    lambdaFunction.handlerFn.role?.addManagedPolicy({
      managedPolicyArn: "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
    });

    // Grant Cognito permissions
    lambdaFunction.handlerFn.role?.addManagedPolicy({
      managedPolicyArn: "arn:aws:iam::aws:policy/AmazonCognitoPowerUser",
    });
  }

  grantDynamoPermissions(lambdaFunction: FunctionConstruct) {
    // Grant DynamoDB read permissions
    lambdaFunction.handlerFn.role?.addManagedPolicy({
      managedPolicyArn: "arn:aws:iam::aws:policy/AmazonDynamoDBReadOnlyAccess",
    });
  }

  createDynamoTable() {
    // Create DynamoDB table for institutions
    this.institutionsTable = new dynamodb.Table(this, "InstitutionsTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add GSI for querying by institution name
    this.institutionsTable.addGlobalSecondaryIndex({
      indexName: "institutionNameIndex",
      partitionKey: {
        name: "institutionName",
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Add GSI for querying by admin username
    this.institutionsTable.addGlobalSecondaryIndex({
      indexName: "adminUsernameIndex",
      partitionKey: {
        name: "adminUsername",
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Create DynamoDB table for SNIES institutions
    this.institutionsSniesTable = new dynamodb.Table(
      this,
      "InstitutionsSniesTable",
      {
        tableName: "instituciones_snies",
        partitionKey: { name: "codigo", type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      }
    );

    // Create DynamoDB table for conversations
    const conversationsTable = new dynamodb.Table(this, "ConversationsTable", {
      tableName: "Conversations",
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create DynamoDB table for applications
    const applicationsTable = new dynamodb.Table(this, "ApplicationsTable", {
      tableName: "Applications",
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Add GSI for querying applications by programId
    applicationsTable.addGlobalSecondaryIndex({
      indexName: "programIdIndex",
      partitionKey: {
        name: "programId",
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Output the table names
    new cdk.CfnOutput(this, "institutions-table-name", {
      value: this.institutionsTable.tableName,
      key: "institutionsTableName",
    });

    new cdk.CfnOutput(this, "instituciones-snies-table-name", {
      value: this.institutionsSniesTable.tableName,
      key: "institucionesSniesTableName",
    });

    new cdk.CfnOutput(this, "conversations-table-name", {
      value: conversationsTable.tableName,
      key: "conversationsTableName",
    });

    new cdk.CfnOutput(this, "applications-table-name", {
      value: applicationsTable.tableName,
      key: "applicationsTableName",
    });
  }

  setUpAuth() {
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cognito-readme.html
    this.userPool = new UserPool(this, "InstitutionUsers", {
      signInCaseSensitive: false,
      selfSignUpEnabled: true, // Enable self sign-up
      userVerification: {
        emailSubject: `Confirma tu email para AcademiaNet`,
        emailBody: `Gracias por registrarte con nosotros. Este es tu código de verificación {####}`,
        emailStyle: VerificationEmailStyle.CODE,
        smsMessage: `Gracias por registrarte con nosotros. Este es tu código de verificación {####}`,
      },
      userInvitation: {
        emailSubject: `Invitación para AcademiaNet`,
        emailBody: `Hola {username}, tu contraseña temporal es {####}`,
        smsMessage: `Hola {username}, tu contraseña temporal es {####}`,
      },
      signInAliases: {
        username: true,
        email: true,
      },
      customAttributes: {
        institutionName: new StringAttribute({
          minLen: 2,
          maxLen: 100,
          mutable: true,
        }),
        institutionLegalName: new StringAttribute({
          minLen: 2,
          maxLen: 100,
          mutable: true,
        }),
        instAbbr: new StringAttribute({
          minLen: 2,
          maxLen: 20,
          mutable: true,
        }),
        institutionId: new StringAttribute({
          minLen: 36,
          maxLen: 36,
          mutable: true,
        }),
      },
      standardAttributes: {
        fullname: {
          required: true,
          mutable: true,
        },
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cdk.aws_cognito.AccountRecovery.EMAIL_ONLY,
    });

    this.userPoolClient = this.userPool.addClient("webapp-client", {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          implicitCodeGrant: true,
        },
        callbackUrls: [
          "http://localhost:3000/callback",
          "https://yourdomain.com/callback",
        ],
        logoutUrls: [
          "http://localhost:3000/logout",
          "https://yourdomain.com/logout",
        ],
      },
    });

    new cdk.CfnOutput(this, "user-pool-id", {
      value: this.userPool.userPoolId,
      key: "userPoolId",
    });

    new cdk.CfnOutput(this, "user-pool-client-id", {
      value: this.userPoolClient.userPoolClientId,
      key: "userPoolClientId",
    });
  }

  setupS3BucketAndLambdaTrigger() {
    console.log("Setting up S3 bucket and Lambda trigger...");

    // Create S3 bucket for Excel files
    const excelBucket = new s3.Bucket(this, "ExcelBucket", {
      bucketName: `academianet-excel-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
    });
    console.log("Excel bucket created:", excelBucket.bucketName);

    // Create Lambda function to process Excel files
    const excelProcessorFunction = new FunctionConstruct(
      this,
      "ExcelProcessor"
    );
    excelProcessorFunction.createLayer("xlsxLayer", "./layers/xlsx-lib");
    excelProcessorFunction.code("./functions/process_excel");
    console.log(
      "Excel processor function created:",
      excelProcessorFunction.handlerFn.functionName
    );

    // Set environment variables for the Excel processor function
    excelProcessorFunction.handlerFn.addEnvironment(
      "INSTITUTIONS_SNIES_TABLE",
      this.institutionsSniesTable.tableName
    );
    console.log("Environment variables set for Excel processor function");

    // Grant S3 and DynamoDB permissions
    excelProcessorFunction.handlerFn.role?.addManagedPolicy({
      managedPolicyArn: "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
    });
    excelProcessorFunction.handlerFn.role?.addManagedPolicy({
      managedPolicyArn: "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
    });
    console.log("Permissions granted to Excel processor function");

    // Add S3 notification to Lambda
    console.log("Configuring S3 event notification...");
    console.log("- Bucket name:", excelBucket.bucketName);
    console.log("- Lambda ARN:", excelProcessorFunction.handlerFn.functionArn);
    console.log("- Event type: s3.EventType.OBJECT_CREATED");
    console.log("- Prefix filter: uploads/");
    console.log("- Suffix filter: .xlsx");

    excelBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      // @ts-ignore
      new s3n.LambdaDestination(excelProcessorFunction.handlerFn),
      {
        prefix: "uploads/",
        suffix: ".xlsx",
      }
    );
    console.log("S3 event notification configured successfully");

    // Explicitly grant permission for S3 to invoke the Lambda function
    const lambdaPermission = new lambda.CfnPermission(
      this,
      "S3InvokeLambdaPermission",
      {
        action: "lambda:InvokeFunction",
        functionName: excelProcessorFunction.handlerFn.functionName,
        principal: "s3.amazonaws.com",
        sourceArn: excelBucket.bucketArn,
      }
    );
    console.log("Explicit Lambda permission granted to S3");

    // Output the bucket name
    new cdk.CfnOutput(this, "excel-bucket-name", {
      value: excelBucket.bucketName,
      description: "Nombre del bucket para archivos Excel",
    });

    // Output the Lambda function name for viewing logs
    new cdk.CfnOutput(this, "lambda-logs-cmd", {
      value: `aws logs tail /aws/lambda/${excelProcessorFunction.handlerFn.functionName} --follow`,
      description:
        "Comando para ver los logs de la función Lambda en tiempo real",
    });

    // Add instructions for testing
    new cdk.CfnOutput(this, "upload-test-cmd", {
      value: `aws s3 cp TU-ARCHIVO.xlsx s3://${excelBucket.bucketName}/uploads/`,
      description: "Comando para subir un archivo Excel de prueba",
    });

    console.log("S3 bucket and Lambda trigger setup completed");
  }
}
