import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs'
import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as sns from "aws-cdk-lib/aws-sns"
import * as subs from "aws-cdk-lib/aws-sns-subscriptions"
import * as iam from "aws-cdk-lib/aws-iam"
import * as sqs from "aws-cdk-lib/aws-sqs"
import * as lambdaEventSource from "aws-cdk-lib/aws-lambda-event-sources"
import * as event from "aws-cdk-lib/aws-events"
import { Construct } from 'constructs'

interface OrdersAppStackProps extends cdk.StackProps {
    productsDdb: dynamodb.Table
    eventsDdb: dynamodb.Table
    auditBus: event.EventBus
}

export class OrdersAppStack extends cdk.Stack {
    readonly ordersHandler: lambdaNodeJS.NodejsFunction
    readonly orderEventsFetchHandler: lambdaNodeJS.NodejsFunction

    constructor(scope: Construct, id: string, props: OrdersAppStackProps) {
        super(scope, id, props)

        const ordersDdb = new dynamodb.Table(this, "ordersDdb", {
            tableName: "orders",
            partitionKey: {
                name: "pk",
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: "sk",
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1
        })

        //Orders Layer
        const ordersLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrderLayerVersionArn")
        const ordersLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrderLayerVersionArn", ordersLayerArn) //Estou acessando o AppLayers através de parâmetros

        //Orders Api Layer
        const ordersApiLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrdersApiLayerVersionArn")
        const ordersApiLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrdersApiLayerVersionArn", ordersApiLayerArn) //Estou acessando o AppLayers através de parâmetros

        //Orders Events Layer
        const orderEventsLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrderEventsLayerVersionArn")
        const orderEventsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrderEventsLayerVersionArn", orderEventsLayerArn) //Estou acessando o AppLayers através de parâmetros

        //Orders Events Repository Layer
        const orderEventsRepositoryLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrderEventsRepositoryLayerVersionArn")
        const orderEventsRepositoryLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrderEventsRepositoryLayerVersionArn", orderEventsRepositoryLayerArn) //Estou acessando o AppLayers através de parâmetros

        //Products Layer
        const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductsLayerVersionArn")
        const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductsLayerVersionArn", productsLayerArn) //Estou acessando o AppLayers através de parâmetros

        //Dica dele de criar um unico topico por modelo, por exemplo, "order"
        const ordersTopic = new sns.Topic(this, "OrderEventsTopic", {
            displayName: "Order events topic",
            topicName: "order-events"
        })

        this.ordersHandler = new lambdaNodeJS.NodejsFunction(this, "OrdersFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "OrdersFunction",
            entry: "lambda/orders/ordersFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
            handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
            // memorySize: 128, //quantos MB será separado para o funcionamento da função
            timeout: cdk.Duration.seconds(2), //timeout he
            bundling: {
                minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
            },
            environment: {
                PRODUCTS_DDB: props.productsDdb.tableName,
                ORDERS_DDB: ordersDdb.tableName,
                ORDER_EVENTS_TOPIC_ARN: ordersTopic.topicArn,
                AUDIT_BUS_NAME: props.auditBus.eventBusName
            },
            layers: [ordersLayer, productsLayer, ordersApiLayer, orderEventsLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
        })

        ordersDdb.grantReadWriteData(this.ordersHandler)
        props.productsDdb.grantReadData(this.ordersHandler)
        ordersTopic.grantPublish(this.ordersHandler)
        props.auditBus.grantPutEventsTo(this.ordersHandler)

        const orderEventsHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEventsFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "OrderEventsFunction",
            entry: "lambda/orders/orderEventsFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
            handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
            // memorySize: 128, //quantos MB será separado para o funcionamento da função
            timeout: cdk.Duration.seconds(2), //timeout he
            bundling: {
                minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
            },
            environment: {
                EVENTS_DDB: props.eventsDdb.tableName
            },
            layers: [orderEventsLayer, orderEventsRepositoryLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
        })

        ordersTopic.addSubscription(new subs.LambdaSubscription(orderEventsHandler))

        const eventsDdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [props.eventsDdb.tableArn],
            conditions: {
                ['ForAllValues:StringLike']: {
                    'dynamodb:LeadingKeys': ['#order_*']
                }
            }
        })
        orderEventsHandler.addToRolePolicy(eventsDdbPolicy)

        const billingHandler = new lambdaNodeJS.NodejsFunction(this, "BillingFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "BillingFunction",
            entry: "lambda/orders/billingFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
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

        //Aqui estamos nos inscrevendo no topico "Order" do SNS, porem limitando a escutar apenas os eventos de ORDER_CREATED
        ordersTopic.addSubscription(new subs.LambdaSubscription(billingHandler, {
            filterPolicy: {
                eventType: sns.SubscriptionFilter.stringFilter({
                    allowlist: ['ORDER_CREATED']
                })
            }
        }))

        //Criando outra fila, para guardar as mensagens que deram erro ao tentar tratar
        const orderEventsDlq = new sqs.Queue(this, "OrderEventsDlq", {
            queueName: "order-events-dlq",
            enforceSSL: false,
            encryption: sqs.QueueEncryption.UNENCRYPTED,
            retentionPeriod: cdk.Duration.days(10),
        })

        //inscrevendo o SQS no topic de orders e adicionando uma tratativa para mensagens que deem erro, no caso, serem encaminhadas para a dead letter queue
        const orderEventsQueue = new sqs.Queue(this, "OrderEventsQueue", {
            queueName: "order-events",
            enforceSSL: false,
            encryption: sqs.QueueEncryption.UNENCRYPTED,
            deadLetterQueue: {
                maxReceiveCount: 3,
                queue: orderEventsDlq
            }
        })

        ordersTopic.addSubscription(new subs.SqsSubscription(orderEventsQueue, {
            filterPolicy: {
                eventType: sns.SubscriptionFilter.stringFilter({
                    allowlist: ['ORDER_CREATED']
                })
            }
        }))

        const orderEmailsHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEmailsFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "OrderEmailsFunction",
            entry: "lambda/orders/orderEmailsFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
            handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
            // memorySize: 128, //quantos MB será separado para o funcionamento da função
            timeout: cdk.Duration.seconds(2), //timeout he
            bundling: {
                minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
            },
            layers: [orderEventsLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
        })

        //Criamos a lambda, acionamos ela quando existir uma queue e demos permissão a lambda de ler as mensagens do SQS
        orderEmailsHandler.addEventSource(new lambdaEventSource.SqsEventSource(orderEventsQueue, {
            batchSize: 5,
            enabled: true,
            maxBatchingWindow: cdk.Duration.minutes(1)
        }))
        orderEventsQueue.grantConsumeMessages(orderEmailsHandler)

        const orderEmailPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["ses:SendEmail", "ses:SendRawEmail"],
            resources: ["*"]
        })
        orderEmailsHandler.addToRolePolicy(orderEmailPolicy)

        this.orderEventsFetchHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEventsFetchFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "OrderEventsFetchFunction",
            entry: "lambda/orders/orderEventsFetchFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
            handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
            // memorySize: 128, //quantos MB será separado para o funcionamento da função
            timeout: cdk.Duration.seconds(2), //timeout he
            bundling: {
                minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
            },
            environment: {
                EVENTS_DDB: props.eventsDdb.tableName
            },
            layers: [orderEventsRepositoryLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
        })

        const eventsFetchDdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['dynamodb:Query'],
            resources: [`${props.eventsDdb.tableArn}/index/emailIndex`]
        })
        this.orderEventsFetchHandler.addToRolePolicy(eventsFetchDdbPolicy)
    }
}