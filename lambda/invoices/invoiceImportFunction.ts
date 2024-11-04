import { APIGatewayProxyEvent, APIGatewayProxyResult, Context, S3Event, S3EventRecord } from "aws-lambda"
import { ApiGatewayManagementApi, DynamoDB, S3 } from "aws-sdk"
import * as AWSXRay from "aws-xray-sdk"
import { InvoiceTransactionRepository, InvoiceTransactionStatus } from "/opt/nodejs/invoiceTransaction"
import { InvoiceWSService } from "/opt/nodejs/invoiceWSConnection"
import { InvoiceFile, InvoiceRepository } from "/opt/nodejs/invoiceRepository"

AWSXRay.captureAWS(require("aws-sdk"))

const invoicesDdb = process.env.INVOICE_DDB!
const invoicesWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6)

//Os clientes que iremos usar
const s3Client = new S3()
const ddbClient = new DynamoDB.DocumentClient()
const apigwManagementApi = new ApiGatewayManagementApi({
    endpoint: invoicesWsApiEndpoint
})

//Importando os layers que usaremos nessa lambda
const invoiceTransactionRepository = new InvoiceTransactionRepository(ddbClient, invoicesDdb)
const invoiceWSService = new InvoiceWSService(apigwManagementApi)
const invoiceRepository = new InvoiceRepository(ddbClient, invoicesDdb)

export async function handler(event: S3Event, context: Context): Promise<void> {
    
    const promises: Promise<void>[] = []
    console.log(event)
    
    event.Records.forEach((record) => {
        promises.push(processRecord(record))
    })

    await Promise.all(promises)
}

async function processRecord(record: S3EventRecord): Promise<void> {
    const key = record.s3.object.key
    const bucketName = record.s3.bucket.name

    try {
        const invoiceTransaction = await invoiceTransactionRepository.getInvoiceTransaction(key)

        if(invoiceTransaction.transactionStatus === InvoiceTransactionStatus.GENERATED) {
            await Promise.all([
                invoiceWSService.sendInvoiceStatus(key, invoiceTransaction.connectionId, InvoiceTransactionStatus.RECEIVED),
                invoiceTransactionRepository.updateInvoiceTransaction(key, InvoiceTransactionStatus.RECEIVED)
            ])


        } else {
            await invoiceWSService.sendInvoiceStatus(key, invoiceTransaction.connectionId, invoiceTransaction.transactionStatus)
            console.error(`Non valid transaction status`)
            return
        }

        const object = await s3Client.getObject({
            Key: key,
            Bucket: bucketName
        }).promise()

        const invoice = JSON.parse(object.Body!.toString("utf-8")) as InvoiceFile
        console.log(invoice)

        const createInvoicePromise = invoiceRepository.create({
            pk: `#invoice_${invoice.customerName}`,
            sk: invoice.invoiceNumber,
            ttl: 0,
            totalValue: invoice.totalValue,
            productId: invoice.productId,
            quantity: invoice.quantity,
            transactionId: key,
            createdAt: Date.now()
        })

        const deleteObjPromise = s3Client.deleteObject({
            Key: key,
            Bucket: bucketName
        }).promise()

        const updateInvoicePromise = invoiceTransactionRepository.updateInvoiceTransaction(key, InvoiceTransactionStatus.PROCESSED)
        const sendStatusPromise = invoiceWSService.sendInvoiceStatus(key, invoiceTransaction.connectionId, InvoiceTransactionStatus.PROCESSED)

        await Promise.all([createInvoicePromise, deleteObjPromise, updateInvoicePromise, sendStatusPromise])

    } catch (error) {
        console.log((<Error>error).message)
    }
    
}

