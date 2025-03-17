import * as cdk from "aws-cdk-lib";
import { StringAttribute, UserPool, UserPoolClient, VerificationEmailStyle } from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { RestApiConstruct, FunctionConstruct } from "devarchy-cdk";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AcademianetBackendFinalStack extends cdk.Stack {
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  institutionsTable: dynamodb.Table;
  
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const api = new RestApiConstruct(this, "academianetApi");
    
    // Create DynamoDB table for institutions
    this.createDynamoTable();
    
    // Set up authentication
    this.setUpAuth();
    
    // Set up Lambda functions
    const handleGetInstitutions = new FunctionConstruct(this, 'handleGetInstitutions');
    handleGetInstitutions.code("./functions/get_institutions");
    
    // Create registration Lambda function
    const handleRegisterInstitution = new FunctionConstruct(this, 'handleRegisterInstitution');
    handleRegisterInstitution.code("./functions/register_institution");
    
    // Set environment variables for the Lambda function
    handleRegisterInstitution.handlerFn.addEnvironment('USER_POOL_ID', this.userPool.userPoolId);
    handleRegisterInstitution.handlerFn.addEnvironment('USER_POOL_CLIENT_ID', this.userPoolClient.userPoolClientId);
    handleRegisterInstitution.handlerFn.addEnvironment('INSTITUTIONS_TABLE', this.institutionsTable.tableName);
    
    // Set up API endpoints
    api.cors();
    api.get('/institutions')?.fn(handleGetInstitutions.handlerFn);
    api.post('/register')?.fn(handleRegisterInstitution.handlerFn);
    
    // Grant permissions after setting up the API
    this.grantPermissions(handleRegisterInstitution);
  }

  grantPermissions(lambdaFunction: FunctionConstruct) {
    // Grant DynamoDB permissions
    const tableArn = this.institutionsTable.tableArn;
    lambdaFunction.handlerFn.role?.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess'
    });
    
    // Grant Cognito permissions
    lambdaFunction.handlerFn.role?.addManagedPolicy({
      managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonCognitoPowerUser'
    });
  }

  createDynamoTable() {
    // Create DynamoDB table for institutions
    this.institutionsTable = new dynamodb.Table(this, 'InstitutionsTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    
    // Add GSI for querying by institution name
    this.institutionsTable.addGlobalSecondaryIndex({
      indexName: 'institutionNameIndex',
      partitionKey: { name: 'institutionName', type: dynamodb.AttributeType.STRING },
    });
    
    // Output the table name
    new cdk.CfnOutput(this, 'institutions-table-name', {
      value: this.institutionsTable.tableName,
      key: 'institutionsTableName',
    });
  }

  setUpAuth() {
    // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cognito-readme.html
    this.userPool = new UserPool(this, 'InstitutionUsers', {
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
        institutionName: new StringAttribute({ minLen: 2, maxLen: 100, mutable: true }),
        institutionLegalName: new StringAttribute({ minLen: 2, maxLen: 100, mutable: true }),
        institutionAbbreviation: new StringAttribute({ minLen: 2, maxLen: 20, mutable: true }),
        institutionId: new StringAttribute({ minLen: 36, maxLen: 36, mutable: true })
      },
      standardAttributes: {
        fullname: {
          required: true,
          mutable: true,
        },
        email: {
          required: true,
          mutable: true,
        }
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
    
    this.userPoolClient = this.userPool.addClient('webapp-client', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          implicitCodeGrant: true,
        },
        callbackUrls: ['http://localhost:3000/callback', 'https://yourdomain.com/callback'],
        logoutUrls: ['http://localhost:3000/logout', 'https://yourdomain.com/logout'],
      },
    });

    new cdk.CfnOutput(this, 'user-pool-id', {
      value: this.userPool.userPoolId,
      key: 'userPoolId',
    });

    new cdk.CfnOutput(this, 'user-pool-client-id', {
      value: this.userPoolClient.userPoolClientId,
      key: 'userPoolClientId',
    });
  }
}
