import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { RestApiConstruct } from "devarchy-cdk";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AcademianetBackendFinalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const api = new RestApiConstruct(this, "apiTest");
    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'AcademianetBackendFinalQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}
