import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { ProductRepository } from "/opt/nodejs/productsLayer"; //Estamos importando desse jeito por conta do lambda, quando subirmos para a aws o lambda vai armazenar de um modo diferente, ao invés de apontar para o caminho original, temos de criar o nosso próprio
import { DynamoDB } from "aws-sdk"

const productsDdb = process.env.PRODUCTS_DDB! //no arquivo productsApp-stack passamos para a variavel PRODUCTS_DDB o nome da tabela, e aqui estaremos recuperando
const ddbClient = new DynamoDB.DocumentClient()

const productRepository = new ProductRepository(ddbClient, productsDdb)

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    
    const lambdaRequestId = context.awsRequestId //Id de cada request feita nessa lambda, identificação unica para cada execução
    const apiRequestId = event.requestContext.requestId
    
    console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`) // console logs irão aparecer no cloudwatch

    // method são os dados da função, que tipo de método foi disparado e etc, com esses dados vamos conseguir achar o endereço dele
    const method = event.httpMethod
    
    // Com o tipo do metodo e o endereço podemos agora finalmente entregar a request a quem vai trata-la
    if(event.resource === "/products") {
        if(method === "GET") {
            console.log("GET - /Products")
            
            const products = await productRepository.getAllProducts()

            return {
                statusCode: 200,
                body: JSON.stringify(products)
            }
        }
    } else if(event.resource === "/products/{id}") {
        const productId = event.pathParameters!.id as string
        console.log(`GET /products/${productId}`)
        
        try {
            const product = await productRepository.getProductById(productId)
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

    return {
        statusCode: 400,
        body: JSON.stringify({
            message: "BAD request"
        })
    }
}