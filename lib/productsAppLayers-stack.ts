import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as ssm from "aws-cdk-lib/aws-ssm"

export class ProductsAppLayersStack extends cdk.Stack {

    readonly productsLayers: lambda.LayerVersion

    constructor(scope: Construct, id: string, props: cdk.StackProps) {
        super(scope, id, props)

        this.productsLayers = new lambda.LayerVersion(this, "ProductsLayer", {
            code: lambda.Code.fromAsset('lambda/products/layers/productsLayer'), //Código que vai ser compartilhado entre as duas lambdas vai estar nesse arquivo
            compatibleRuntimes: [lambda.Runtime.NODEJS_16_X], //As lambdas estão utilizando a versão do node 16
            layerVersionName: "ProductsLayer",
            removalPolicy: cdk.RemovalPolicy.RETAIN //Padrão é para ser destruido, mas vamos mudar por conta desse layer ser usado em outras lambdas
        })
        //Ao criar esta layer, iremos criar uma versão que será armazenada nesse ssm.Stringparameter que depois será resgatada pela stack de produtos
        new ssm.StringParameter(this, "ProductsLayerVersionArn", {
            parameterName: "ProductsLayerVersionArn",
            stringValue: this.productsLayers.layerVersionArn
        })
    }
}