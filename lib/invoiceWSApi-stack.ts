import * as cdk from "aws-cdk-lib"
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2"
import * as apigatewayv2_integrations from "aws-cdk-lib/aws-apigatewayv2-integrations"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as iam from "aws-cdk-lib/aws-iam"
import * as s3n from "aws-cdk-lib/aws-s3-notifications"
import * as ssm from "aws-cdk-lib/aws-ssm"
import * as sqs from "aws-cdk-lib/aws-sqs"
import * as lambdaEventsSource from "aws-cdk-lib/aws-lambda-event-sources"
import * as event from "aws-cdk-lib/aws-events"
import { Construct } from "constructs"

interface InvoiceWSApiStackProps extends cdk.StackProps {
    eventsDdb: dynamodb.Table
    auditBus: event.EventBus
}

export class InvoiceWSApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: InvoiceWSApiStackProps) {
        super(scope, id, props)

        //Invoice Transaction Layer
        const invoiceTransactionLayerArn = ssm.StringParameter
            .valueForStringParameter(this, "InvoiceTransactionLayerVersionArn")
        const invoiceTransactionLayer = lambda.LayerVersion
            .fromLayerVersionArn(this, "InvoiceTransactionLayer", invoiceTransactionLayerArn)

        //Invoice Layer
        const invoiceLayerArn = ssm.StringParameter
            .valueForStringParameter(this, "InvoiceRepositoryLayerVersionArn")
        const invoiceLayer = lambda.LayerVersion
            .fromLayerVersionArn(this, "InvoiceRepositoryLayer", invoiceLayerArn)

        //Invoice WebSocket API Layer
        const invoiceWSConnectionLayerArn = ssm.StringParameter
            .valueForStringParameter(this, "InvoiceWSConnectionLayerVersionArn")
        const invoiceWSConnectionLayer = lambda.LayerVersion
            .fromLayerVersionArn(this, "InvoiceWSConnectionLayer", invoiceWSConnectionLayerArn)

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
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
        })

        //Invoice bucket
        const bucket = new s3.Bucket(this, "InvoiceBucket", {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    enabled: true,
                    expiration: cdk.Duration.days(1)
                }
            ]
        })


        //WebSocket connection handler
        const connectionHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceConnectionFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "InvoiceConnectionFunction",
            entry: "lambda/invoices/invoiceConnectionFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
            handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
            // memorySize: 128, //quantos MB será separado para o funcionamento da função
            timeout: cdk.Duration.seconds(2), //timeout he
            bundling: {
                minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
            },
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
        })

        //WebSocket disconnection handler
        const disconnectionHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceDisconnectionFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "InvoiceDisconnectionFunction",
            entry: "lambda/invoices/invoiceDisconnectionFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
            handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
            // memorySize: 128, //quantos MB será separado para o funcionamento da função
            timeout: cdk.Duration.seconds(2), //timeout he
            bundling: {
                minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
            },
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
        })

        //WebSocket API
        const webSocketApi = new apigatewayv2.WebSocketApi(this, "InvoiceWSApi", {
            apiName: "InvoiceWSApi",
            connectRouteOptions: {
                integration: new apigatewayv2_integrations.WebSocketLambdaIntegration("ConnectionHandler", connectionHandler)
            },
            disconnectRouteOptions: {
                integration: new apigatewayv2_integrations.WebSocketLambdaIntegration("DisconnectionHandler", disconnectionHandler)
            }
        })

        const stage = "prod"
        const wsApiEndpoint = `${webSocketApi.apiEndpoint}/${stage}`
        new apigatewayv2.WebSocketStage(this, "InvoiceWSApiStage", {
            webSocketApi: webSocketApi,
            stageName: stage,
            autoDeploy: true
        })

        //Invoice URL handler
        const getUrlHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceGetUrlFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "InvoiceGetUrlFunction",
            entry: "lambda/invoices/invoiceGetUrlFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
            handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
            // memorySize: 128, //quantos MB será separado para o funcionamento da função
            timeout: cdk.Duration.seconds(2), //timeout he
            bundling: {
                minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
            },
            layers: [invoiceTransactionLayer, invoiceWSConnectionLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0, //Adicionamos um novo layer para termos acesso ao lambda insights
            environment: {
                INVOICE_DDB: invoicesDdb.tableName,
                BUCKET_NAME: bucket.bucketName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint
            }
        })
        const invoicesDdbWriteTransactionPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:PutItem'],
            resources: [invoicesDdb.tableArn],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#transaction']
                }
            }
        })

        //Estou dando a permissão a lambda de colocar um obj no bucket, se não, o usuário não consegue colocar o item pela url
        const invoicesBucketPutObjectPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:PutObject'],
            resources: [`${bucket.bucketArn}/*`]
        })

        getUrlHandler.addToRolePolicy(invoicesBucketPutObjectPolicy)
        getUrlHandler.addToRolePolicy(invoicesDdbWriteTransactionPolicy)
        webSocketApi.grantManageConnections(getUrlHandler)

        //Invoice import handler
        const invoiceImportHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceImportFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "InvoiceImportFunction",
            entry: "lambda/invoices/invoiceImportFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
            handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
            // memorySize: 128, //quantos MB será separado para o funcionamento da função
            timeout: cdk.Duration.seconds(2), //timeout he
            bundling: {
                minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
            },
            layers: [invoiceTransactionLayer, invoiceWSConnectionLayer, invoiceLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0, //Adicionamos um novo layer para termos acesso ao lambda insights
            environment: {
                INVOICE_DDB: invoicesDdb.tableName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
                AUDIT_BUS_NAME: props.auditBus.eventBusName
            }
        })
        invoicesDdb.grantReadWriteData(invoiceImportHandler)
        props.auditBus.grantPutEventsTo(invoiceImportHandler)

        bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(invoiceImportHandler))

        const invoicesBucketGetDeleteObjectPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:GetObject", "s3:DeleteObject"],
            resources: [`${bucket.bucketArn}/*`]
        })
        invoiceImportHandler.addToRolePolicy(invoicesBucketGetDeleteObjectPolicy)
        webSocketApi.grantManageConnections(invoiceImportHandler)

        //Candel import handler
        const cancelImportHandler = new lambdaNodeJS.NodejsFunction(this, "CancelImportFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "CancelImportFunction",
            entry: "lambda/invoices/cancelImportFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
            handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
            // memorySize: 128, //quantos MB será separado para o funcionamento da função
            timeout: cdk.Duration.seconds(2), //timeout he
            bundling: {
                minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
            },
            layers: [invoiceTransactionLayer, invoiceWSConnectionLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0, //Adicionamos um novo layer para termos acesso ao lambda insights
            environment: {
                INVOICE_DDB: invoicesDdb.tableName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint
            }
        })
        const invoicesDdbReadWriteTransactionPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:UpdateItem', 'dynamodb:GetItem'],
            resources: [invoicesDdb.tableArn],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#transaction']
                }
            }
        })
        cancelImportHandler.addToRolePolicy(invoicesDdbReadWriteTransactionPolicy)
        webSocketApi.grantManageConnections(cancelImportHandler)

        //WebSocket API routes
        webSocketApi.addRoute("getImportUrl", {
            integration: new apigatewayv2_integrations.WebSocketLambdaIntegration("GetUrlHandler", getUrlHandler)
        })

        webSocketApi.addRoute("cancelImport", {
            integration: new apigatewayv2_integrations.WebSocketLambdaIntegration("CancelImportHandler", cancelImportHandler)
        })

        const invoiceEventsHandler = new lambdaNodeJS.NodejsFunction(this, "InvoiceEventsFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "InvoiceEventsFunction",
            entry: "lambda/invoices/invoiceEventsFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
            handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
            // memorySize: 128, //quantos MB será separado para o funcionamento da função
            timeout: cdk.Duration.seconds(2), //timeout he
            bundling: {
                minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
            },
            environment: {
                EVENTS_DDB: props.eventsDdb.tableName,
                INVOICE_WSAPI_ENDPOINT: wsApiEndpoint,
                AUDIT_BUS_NAME: props.auditBus.eventBusName
            },
            layers: [invoiceWSConnectionLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
        })

        const eventsDdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [props.eventsDdb.tableArn],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#invoice_*']
                }
            }
        })
        invoiceEventsHandler.addToRolePolicy(eventsDdbPolicy)
        props.auditBus.grantPutEventsTo(invoiceEventsHandler)
        webSocketApi.grantManageConnections(invoiceEventsHandler)

        const invoiceEventsDlq = new sqs.Queue(this, "InvoiceEventsDlq", {
            queueName: "invoice-events-dlq"
        })

        invoiceEventsHandler.addEventSource(new lambdaEventsSource.DynamoEventSource(invoicesDdb, {
            startingPosition: lambda.StartingPosition.TRIM_HORIZON,
            batchSize: 5,
            bisectBatchOnError: true,
            onFailure: new lambdaEventsSource.SqsDlq(invoiceEventsDlq),
            retryAttempts: 3
        }))

    }
}

