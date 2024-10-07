import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs'
import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'

interface OrdersAppStackProps extends cdk.StackProps {
    productsDdb: dynamodb.Table
}

export class OrdersAppStack extends cdk.Stack {
    readonly ordersHandler: lambdaNodeJS.NodejsFunction
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

        //Orders Layer
        const ordersApiLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrdersApiLayerVersionArn")
        const ordersApiLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrdersApiLayerVersionArn", ordersApiLayerArn) //Estou acessando o AppLayers através de parâmetros

        
        //Products Layer
        const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductsLayerVersionArn")
        const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductsLayerVersionArn", productsLayerArn) //Estou acessando o AppLayers através de parâmetros

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
                ORDERS_DDB: ordersDdb.tableName
            },
            layers: [ordersLayer, productsLayer, ordersApiLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
        })

        ordersDdb.grantReadWriteData(this.ordersHandler)
        props.productsDdb.grantReadData(this.ordersHandler)
    }
}