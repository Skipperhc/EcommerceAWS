import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";

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

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: "GET Products - OK"
                })
            }
        }
    } else if(event.resource === "/products/{id}") {
        const productId = event.pathParameters!.id as string
        console.log(`GET /products/${productId}`)
        return {
            statusCode: 200,
            body: `GET /products/${productId}`
        }
    }

    return {
        statusCode: 400,
        body: JSON.stringify({
            message: "BAD request"
        })
    }
}