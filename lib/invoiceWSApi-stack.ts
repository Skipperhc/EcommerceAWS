import * as cdk from "aws-cdk-lib"
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as iam from "aws-cdk-lib/aws-iam"
import * as s3n from "aws-cdk-lib/aws-s3-notifications"
import { Construct } from "constructs"

export class InvoiceWSApistack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        //invoice and invoice transaction DDB

        //Criação da tabela invoices no dynamoDB
        const invoicesDdb = new dynamodb.Table(this, "InvoiceDdb", {
            tableName: "invoices",
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1,
            partitionKey: {
                name: "pk",
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: "sk",
                type: dynamodb.AttributeType.STRING
            },
            timeToLiveAttribute: "ttl",
            removalPolicy: cdk.RemovalPolicy.DESTROY
        })

        //Invoice bucket

        //WebSocket connection handler

        //WebSocket disconnection handler

        //WebSocket API

        //Invoice URL handler

        //Invoice import handler

        //Candel import handler

        //WebSocket API routes
    }
}

