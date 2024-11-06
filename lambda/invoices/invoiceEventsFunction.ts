import { AttributeValue, Context, DynamoDBStreamEvent } from "aws-lambda"
import { ApiGatewayManagementApi, DynamoDB } from "aws-sdk"
import { InvoiceWSService } from "/opt/nodejs/invoiceWSConnection"

import * as AWSXRay from "aws-xray-sdk"

AWSXRay.captureAWS(require("aws-sdk"))

const eventsDdb = process.env.EVENTS_DDB!
const invoiceWSApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6)

const ddbClient = new DynamoDB.DocumentClient()
const apigwManagementApi = new ApiGatewayManagementApi({
    endpoint: invoiceWSApiEndpoint
})

const invoiceWSService = new InvoiceWSService(apigwManagementApi)

export async function handler(event: DynamoDBStreamEvent, context: Context): Promise<void> {
    const promises: Promise<void>[] = []

    event.Records.forEach((record) => {
        if (record.eventName === "INSERT") {
            if(record.dynamodb!.NewImage!.pk.S!.startsWith('#transaction')) {
                console.log("Invoice transaction event received")
            } else {
                console.log("Invoice event received")
                promises.push(createEvent(record.dynamodb!.NewImage!, "INVOICE_CREATED"))
            }
        } else if (record.eventName === "MODIFY") {

        } else if (record.eventName === "REMOVE") {

        }
    })

    await Promise.all(promises)
    return
}

async function createEvent(invoiceImage: {[key: string]: AttributeValue}, eventType: string): Promise<void> {
    const timestamp = Date.now()
    const ttl = ~~(timestamp/ 1000 + (60*5))

    await ddbClient.put({
        TableName: eventsDdb,
        Item: {
            pk: `#invoice_${invoiceImage.sk.S}`,//#invoice_ABC-123
            sk: `${eventType}#${timestamp}`,//INVOICE_CREATED#123
            ttl: ttl,
            email: invoiceImage.pk.S?.split('_')[1],
            createdAt: timestamp,
            eventType: eventType,
            info: {
                transaction: invoiceImage.transactionId.S,
                productId: invoiceImage.productId.S,
                quantity: invoiceImage.quantity.N
            }
        }
    }).promise()

    return 
}
