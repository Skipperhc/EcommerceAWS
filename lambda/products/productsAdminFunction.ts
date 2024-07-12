import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { Product, ProductRepository } from "./layers/productsLayer/nodejs/productRepository"; //Estamos importando desse jeito por conta do lambda, quando subirmos para a aws o lambda vai armazenar de um modo diferente, ao invés de apontar para o caminho original, temos de criar o nosso próprio
import { DynamoDB, Lambda } from "aws-sdk"
import { ProductEvent, ProductEvetnType } from "./layers/productEventsLayer/nodejs/productEvent";
import * as AWSXRay from "aws-xray-sdk"

AWSXRay.captureAWS(require("aws-sdk"))

const productsDdb = process.env.PRODUCTS_DDB! //no arquivo productsApp-stack passamos para a variavel PRODUCTS_DDB o nome da tabela, e aqui estaremos recuperando
const productEventsFunctionName = process.env.PRODUCT_EVENTS_FUNCTION_NAME!
const ddbClient = new DynamoDB.DocumentClient()
const lambdaClient = new Lambda()
const productRepository = new ProductRepository(ddbClient, productsDdb)

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {

    const lambdaRequestId = context.awsRequestId //Id de cada request feita nessa lambda, identificação unica para cada execução
    const apiRequestId = event.requestContext.requestId

    console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`) // console logs irão aparecer no cloudwatch

    if (event.resource === "/products") {
        console.log("POST /products")
        const product = JSON.parse(event.body!) as Product
        const productCreated = await productRepository.create(product)

        const response = await sendProductEvent(product, ProductEvetnType.CREATED, "CREATED@email.com", lambdaRequestId)
        console.log(response)

        return {
            statusCode: 201,
            body: JSON.stringify(productCreated)
        }
    } else if (event.resource === "/products/{id}") {
        const productId = event.pathParameters!.id as string
        if (event.httpMethod === "PUT") {
            console.log(`PUT /products/${productId}`)
            const product = JSON.parse(event.body!) as Product
            try {
                const productUpdated = await productRepository.updateProduct(productId, product)

                const response = await sendProductEvent(productUpdated, ProductEvetnType.UPDATED, "UPDATED@email.com", lambdaRequestId)
                console.log(response)
                return {
                    statusCode: 200,
                    body: JSON.stringify(productUpdated)
                }
            } catch (ConditionalCheckFailedException) {
                return {
                    statusCode: 404,
                    body: 'Product not found when trying to update'
                }
            }
        } else if (event.httpMethod === "DELETE") {
            console.log(`DELETE /products/${productId}`)
            try {
                const product = await productRepository.deleteProduct(productId)

                const response = await sendProductEvent(product, ProductEvetnType.DELETED, "DELETED@email.com", lambdaRequestId)
                console.log(response)

                return {
                    statusCode: 200,
                    body: JSON.stringify(product)
                }
            } catch (error) {
                console.error((<Error>error).message)
                return {
                    statusCode: 404,
                    body: (<Error>error).message
                }
            }
        }
    }

    return {
        statusCode: 400,
        body: "Bad request"
    }
}

function sendProductEvent(
    product: Product, eventType: ProductEvetnType,
    email: string, lambdaRequestId: string) {
    const event: ProductEvent = {
        email: email,
        eventType: eventType,
        productCode: product.code,
        productId: product.id,
        productPrice: product.price,
        requestId: lambdaRequestId
    }

    return lambdaClient.invoke({
        FunctionName: productEventsFunctionName,
        Payload: JSON.stringify(event),
        InvocationType: "Event"
    }).promise()
}