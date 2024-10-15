import { Callback, Context } from "aws-lambda";
import { ProductEvent } from "./layers/productEventsLayer/nodejs/productEvent";
import { DynamoDB } from "aws-sdk";
import * as AWSXRAY from "aws-xray-sdk"


//para evitar atrasos ou erros, tudo que pode ser iniciado antes do handler vai ser iniciado aqui
AWSXRAY.captureAWS(require("aws-sdk"))

const eventsDdb = process.env.EVENTS_DDB!
const ddbClient = new DynamoDB.DocumentClient()

export async function handler(event: ProductEvent, context: Context, callback: Callback): Promise<void> {
    console.log(`Lambda requestId: ${context.awsRequestId}`)
    
    await createEvent(event)

    callback(null, JSON.stringify({
        productEventCreated: true,
        message: "OK"
    }))

}

function createEvent(event: ProductEvent) {
    const timestamp = Date.now()
    const ttl = ~~(timestamp / 1000) + 5 * 60 //5 min a frente do timestamp
    return ddbClient.put({
        TableName: eventsDdb,
        Item: {
            pk: `#product_${event.productCode}`,
            sk: `${event.eventType}#${timestamp}`, //PRODUCT_CREATED#123456
            email: event.email,
            createdAt: timestamp,
            requestId: event.requestId,
            eventType: event.eventType,
            info: {
                productId: event.productId,
                price: event.productPrice
            },
            ttl: ttl
        }
    }).promise()
}