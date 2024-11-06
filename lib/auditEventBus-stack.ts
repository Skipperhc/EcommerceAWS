import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs'
import * as cdk from 'aws-cdk-lib'
import * as sqs from "aws-cdk-lib/aws-sqs"
import * as events from "aws-cdk-lib/aws-events"
import * as targets from "aws-cdk-lib/aws-events-targets"
import { Construct } from 'constructs'

export class AuditEventBusStack extends cdk.Stack {
    readonly bus: events.EventBus

    constructor(scope: Construct, id: string, props: cdk.StackProps) {
        super(scope, id, props)

        this.bus = new events.EventBus(this, "AuditEventBus", {
            eventBusName: "AuditEventBus"
        })

        this.bus.archive("BusArchive", {
            eventPattern: {
                source: ["app.order"]
            },
            archiveName: "auditEvents",
            retention: cdk.Duration.days(10)
        })

        //source: app.order
        //detailType: order
        //reason: PRODUCT_NOT_FOUND
        //Ok aqui criamos a regra, quando chegar uma evento com essa descrição (source, detail e type) enviaremos esse evento ao target abaixo
        const nonValidOrderRule = new events.Rule(this, "NonValidOrderRule", {
            ruleName: "NonValidOrderRule",
            description: "Rule matching non valid order",
            eventBus: this.bus,
            eventPattern: {
                source: ["app.order"],
                detailType: ["order"],
                detail: {
                    reason: ["PRODUCT_NOT_FOUND"]
                }
            }
        })

        //target
        const ordersErrorsFunction = new lambdaNodeJS.NodejsFunction(this, "OrdersErrorsFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "OrdersErrorsFunction",
            entry: "lambda/audit/OrdersErrorsFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
            handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
            // memorySize: 128, //quantos MB será separado para o funcionamento da função
            timeout: cdk.Duration.seconds(2), //timeout he
            bundling: {
                minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
            },
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
        })

        nonValidOrderRule.addTarget(new targets.LambdaFunction(ordersErrorsFunction))


        //source: app.invoice
        //detailType: invoice
        //errorDetail: FAIL_NO_INVOICE_NUMBER
        //Ok aqui criamos a regra, quando chegar uma evento com essa descrição (source, detail e type) enviaremos esse evento ao target abaixo
        const nonValidInvoiceRule = new events.Rule(this, "NonValidInvoiceRule", {
            ruleName: "NonValidInvoiceRule",
            description: "Rule matching non valid order",
            eventBus: this.bus,
            eventPattern: {
                source: ["app.invoice"],
                detailType: ["invoice"],
                detail: {
                    errorDetail: ["FAIL_NO_INVOICE_NUMBER"]
                }
            }
        })

        //target
        const invoicesErrorsFunction = new lambdaNodeJS.NodejsFunction(this, "InvoicesErrorsFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "InvoicesErrorsFunction",
            entry: "lambda/audit/InvoicesErrorsFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
            handler: "handler",//e aqui a function que vai iniciar o processo, o responsável por tratar a request
            // memorySize: 128, //quantos MB será separado para o funcionamento da função
            timeout: cdk.Duration.seconds(2), //timeout he
            bundling: {
                minify: true, //vai apertar toda a função, tirar os espaços, renomear variaveis para "a" ou algo menor, vai diminuir o tamanho do arquivo
                sourceMap: false //cancela a criação de cenários de debug, diminuindo o tamanho do arquivo novamente
            },
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0 //Adicionamos um novo layer para termos acesso ao lambda insights
        })

        nonValidInvoiceRule.addTarget(new targets.LambdaFunction(invoicesErrorsFunction))

        //source: app.invoice
        //detailType: invoice
        //errorDetail: TIMEOUT
        //Ok aqui criamos a regra, quando chegar uma evento com essa descrição (source, detail e type) enviaremos esse evento ao target abaixo
        const timeoutImportInvoiceRule = new events.Rule(this, "TimeoutImportInvoiceRule", {
            ruleName: "TimeoutImportInvoiceRule",
            description: "Rule matching timeout import invoice",
            eventBus: this.bus,
            eventPattern: {
                source: ["app.invoice"],
                detailType: ["invoice"],
                detail: {
                    errorDetail: ["TIMEOUT"]
                }
            }
        })

        //target
        const invoiceImportTimeoutQueue = new sqs.Queue(this, "InvoiceImportTimeout", {
            queueName: "invoice-import-timeout"
        })

        timeoutImportInvoiceRule.addTarget(new targets.SqsQueue(invoiceImportTimeoutQueue))
        
    }
}