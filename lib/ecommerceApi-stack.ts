import * as cdk from "aws-cdk-lib"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import * as cwlogs from 'aws-cdk-lib/aws-logs'
import { Construct } from "constructs"

//para não ter de ficar adicionando vários parametros, criamos uma interface que vai ter os dados que precisamos, é um objeto com todos os parametros que queremos
interface ECommerceApiStackProps extends cdk.StackProps {
    productsFetchHandler: lambdaNodeJS.NodejsFunction;
    productsAdminHandler: lambdaNodeJS.NodejsFunction;
    ordersHandler: lambdaNodeJS.NodejsFunction;
}

export class ECommerceApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ECommerceApiStackProps){
        super(scope, id, props)

        const logGtoup = new cwlogs.LogGroup(this, "ECommerceApiLogs")

        const api = new apigateway.RestApi(this, "ECommerceApi", {
            restApiName: "ECommerceApi",
            cloudWatchRole: true,
            deployOptions: {
                accessLogDestination: new apigateway.LogGroupLogDestination(logGtoup),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
                    httpMethod: true,
                    ip: true,
                    protocol: true,
                    requestTime: true,
                    resourcePath: true,
                    responseLength: true,
                    status: true,
                    caller: true,
                    user: true
                })
            }
        })

        //aqui usamos os parametros passado pelo props, no caso um meio de apontar para a stack de produtos
        this.createProductsService(props, api)
        this.createOrdersService(props, api)
    }

    private createOrdersService(props: ECommerceApiStackProps, api: cdk.aws_apigateway.RestApi) {
        const ordersIntegration = new apigateway.LambdaIntegration(props.ordersHandler)

        //resource - -/orders
        const ordersResorce = api.root.addResource('orders')

        //GET /orders
        //GET /orders?email=matilde@email.com
        //GET /orders?email=matilde@email.com&orderId=123
        ordersResorce.addMethod("GET", ordersIntegration)

        const orderDeletionValidator = new apigateway.RequestValidator(this, "OrderDeletionValidator", {
            restApi: api,
            requestValidatorName: "OrderDeletionValidator",
            validateRequestParameters: true,
        })

        //DELETE /orders?email=matilde@email.com&orderId=123
        ordersResorce.addMethod("DELETE", ordersIntegration, {
            requestParameters: {
                'method.request.querystring.email': true,
                'method.request.querystring.orderId': true
            },
            requestValidator: orderDeletionValidator
        })

        //POST /orders
        ordersResorce.addMethod("POST", ordersIntegration)

    }


    private createProductsService(props: ECommerceApiStackProps, api: cdk.aws_apigateway.RestApi) {
        const productsFetchIntegration = new apigateway.LambdaIntegration(props.productsFetchHandler)

        // GET "/products"
        const productsResource = api.root.addResource("products")
        productsResource.addMethod("GET", productsFetchIntegration)

        // GET /products/{id}
        const productIdResource = productsResource.addResource("{id}")
        productIdResource.addMethod("GET", productsFetchIntegration)

        const productsAdminIntegration = new apigateway.LambdaIntegration(props.productsAdminHandler)

        // POST /products
        productsResource.addMethod("POST", productsAdminIntegration)

        // PUT /products/{id}
        productIdResource.addMethod("PUT", productsAdminIntegration)

        // DELETE /products/{id}
        productIdResource.addMethod("DELETE", productsAdminIntegration)
    }
}
