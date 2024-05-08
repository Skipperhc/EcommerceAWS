import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { Product, ProductRepository } from "/opt/nodejs/productsLayer"; //Estamos importando desse jeito por conta do lambda, quando subirmos para a aws o lambda vai armazenar de um modo diferente, ao invés de apontar para o caminho original, temos de criar o nosso próprio
import { DynamoDB } from "aws-sdk"
import * as AWSXRay from "aws-xray-sdk"

AWSXRay.captureAWS(require("aws-sdk"))

const productsDdb = process.env.PRODUCTS_DDB! //no arquivo productsApp-stack passamos para a variavel PRODUCTS_DDB o nome da tabela, e aqui estaremos recuperando
const ddbClient = new DynamoDB.DocumentClient()

const productRepository = new ProductRepository(ddbClient, productsDdb)

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {

    const lambdaRequestId = context.awsRequestId //Id de cada request feita nessa lambda, identificação unica para cada execução
    const apiRequestId = event.requestContext.requestId

    console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`) // console logs irão aparecer no cloudwatch

    if (event.resource === "/products") {
        console.log("POST /products")
        const product = JSON.parse(event.body!) as Product
        const productCreated = await productRepository.create(product)

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