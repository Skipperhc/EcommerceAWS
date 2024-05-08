import * as lambda from "aws-cdk-lib/aws-lambda"

import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"

import * as cdk from "aws-cdk-lib"
import * as dynadb from "aws-cdk-lib/aws-dynamodb"
import * as ssm from "aws-cdk-lib/aws-ssm"

import { Construct } from "constructs"

export class ProductsAppStack extends cdk.Stack {
    readonly productsFetchHandler: lambdaNodeJS.NodejsFunction // Aqui será o nosso controle programatico sobre a função, como apontamos para a função
    readonly productsAdminHandler: lambdaNodeJS.NodejsFunction //Criando um handler para a leitura dos itens da tabela productsDdb
    readonly productsDdb: dynadb.Table //Tabela de produtos do dynamoDB

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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
                tracing: lambda.Tracing.ACTIVE
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
                    PRODUCTS_DDB: this.productsDdb.tableName //Definindo uma variavel de ambiente, no caso, passando para a productsFetchHandler o nome da tabela que ele quer acessar
                },
                layers: [productsLayer],
                tracing: lambda.Tracing.ACTIVE
            }
        )
        this.productsDdb.grantWriteData(this.productsAdminHandler)
    }
}