import * as lambda from "aws-cdk-lib/aws-lambda"

import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"

import * as cdk from "aws-cdk-lib"
import * as dynadb from "aws-cdk-lib/aws-dynamodb"
import * as ssm from "aws-cdk-lib/aws-ssm"

import { Construct } from "constructs"

interface ProductsAppStackProps extends cdk.StackProps {
    eventsDdb: dynadb.Table //Para conseguir dar acesso a tabela de eventos, vamos importar ela nessa stack e permitir que a stack de admin acesse ela
}

export class ProductsAppStack extends cdk.Stack {
    readonly productsFetchHandler: lambdaNodeJS.NodejsFunction // Aqui será o nosso controle programatico sobre a função, como apontamos para a função
    readonly productsAdminHandler: lambdaNodeJS.NodejsFunction //Criando um handler para a leitura dos itens da tabela productsDdb
    readonly productsDdb: dynadb.Table //Tabela de produtos do dynamoDB

    constructor(scope: Construct, id: string, props: ProductsAppStackProps) {
        super(scope, id, props)

        //Inicializando variavel com dados da tabela no dynamoDB
        this.productsDdb = new dynadb.Table(this, "ProductsDdb", {
            tableName: "products",
            removalPolicy: cdk.RemovalPolicy.DESTROY, //por padrão ele deixa como RETAIN, que é para manter a tabela mesmo se a stack for excluida, deixamos como destroy para fins de estudo
            partitionKey: { //Descrição de como vamos identificar cada item dessa tabela, no caso, o nome vai ser "id" do tipo string
                name: "id",
                type: dynadb.AttributeType.STRING
            },
            billingMode: dynadb.BillingMode.PROVISIONED, //Mudamos tbm o modo como queremos ser cobrados pelo uso do dynamoDB, ao invez de pagar por uso, estamos escolhendo o provisionado, temos 30gb livres por 1 ano
            readCapacity: 1, //Por padrão podemos receber 5 chamadas de leitura por segundo, mudamos para apenas 1, para fins educativos vai ser o suficiente
            writeCapacity: 1 //Por padrão podemos receber 5 chamadas de escrita por segundo, mudamos para apenas 1, para fins educativos vai ser o suficiente
        })

        //Products Layer
        const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductsLayerVersionArn")
        const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductsLayerVersionArn", productsLayerArn) //Estou acessando o AppLayers através de parâmetros
        
        //Product Events Layer
        const productEventsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductEventsLayerVersionArn")
        const productEventsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductEventsLayerVersionArn", productEventsLayerArn) //Estou acessando o AppLayers através de parâmetros

        const productEventsHandler = new lambdaNodeJS.NodejsFunction(
            this,
            "ProductsEventsFunction", //id da função lambda, vai ser como iremos identificar na AWS
            {
                // runtime: lambda.Runtime.NODEJS_20_X,
                memorySize: 512,
                functionName: "ProductsEventsFunction",
                entry: "lambda/products/productEventsFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
                handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
                // memorySize: 128, //quantos MB será separado para o funcionamento da função
                timeout: cdk.Duration.seconds(2), //timeout he
                bundling: {
                    minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                    sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
                },
                environment: {
                    EVENTS_DDB: props.eventsDdb.tableName //Definindo uma variavel de ambiente, no caso, passando para a productsFetchHandler o nome da tabela que ele quer acessar
                },
                layers: [productEventsLayer],
                tracing: lambda.Tracing.ACTIVE,
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
            }
        )
        props.eventsDdb.grantWriteData(productEventsHandler)

        this.productsFetchHandler = new lambdaNodeJS.NodejsFunction(
            this,
            "ProductsFetchFunction", //id da função lambda, vai ser como iremos identificar na AWS
            {
                functionName: "ProductsFetchFunction",
                entry: "lambda/products/productsFetchFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
                handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
                memorySize: 128, //quantos MB será separado para o funcionamento da função
                timeout: cdk.Duration.seconds(5), //timeout he
                bundling: {
                    minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                    sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
                },
                environment: {
                    PRODUCTS_DDB: this.productsDdb.tableName //Definindo uma variavel de ambiente, no caso, passando para a productsFetchHandler o nome da tabela que ele quer acessar
                },
                layers: [productsLayer],
                tracing: lambda.Tracing.ACTIVE,
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
            }
        )
        this.productsDdb.grantReadData(this.productsFetchHandler) //Dando permissão para que a stack productsFetchHandler consiga ler a tabela productsDdb

        this.productsAdminHandler = new lambdaNodeJS.NodejsFunction(
            this,
            "ProductsAdminHandler", //id da função lambda, vai ser como iremos identificar na AWS
            {
                functionName: "ProductsAdminHandler",
                entry: "lambda/products/productsAdminFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
                handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
                memorySize: 128, //quantos MB será separado para o funcionamento da função
                timeout: cdk.Duration.seconds(5), //timeout he
                bundling: {
                    minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                    sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
                },
                environment: {
                    PRODUCTS_DDB: this.productsDdb.tableName, //Definindo uma variavel de ambiente, no caso, passando para a productsFetchHandler o nome da tabela que ele quer acessar
                    PRODUCT_EVENTS_FUNCTION_NAME: productEventsHandler.functionName
                },
                layers: [productsLayer, productEventsLayer],
                tracing: lambda.Tracing.ACTIVE, //Ativando o X-RAY, com ele conseguimos ter noção de quanto tempo foi gasto em cada ação (ativando lambda, acessando o mongodb, etc)
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
            }
        )
        this.productsDdb.grantWriteData(this.productsAdminHandler)
        productEventsHandler.grantInvoke(this.productsAdminHandler)
    }
}