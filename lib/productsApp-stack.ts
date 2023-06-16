import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"

export class ProductsAppStack extends cdk.Stack {
    readonly productsFetchHandler: lambdaNodeJS.NodejsFunction // Aqui será o nosso controle programatico sobre a função, como apontamos para a função

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)
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
            })
    }
}