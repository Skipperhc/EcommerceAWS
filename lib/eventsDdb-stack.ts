import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"

export class EventsDdbStack extends cdk.Stack {
    readonly table: dynamodb.Table

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        this.table = new dynamodb.Table(this, "EventsDdb", {
            tableName: "events",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: {
                name: "pk",
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: "sk",
                type: dynamodb.AttributeType.STRING
            },
            timeToLiveAttribute: "ttl",
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            //readCapacity: 1,
            //writeCapacity: 1
        })

        //Só pra salvar para depois, aqui abaixo está como criar o auto scale do banco de dados


        /*
        //Aqui estamos configurando o autoscale para leitura na tabela
        const readScale = this.table.autoScaleReadCapacity({
            maxCapacity: 2,
            minCapacity: 1
        })
        //Aqui estamos definindo quando o autoscale será usado, quanto tempo depois de quebrar a barreira e quanto tempo depois de esfriar
        readScale.scaleOnUtilization({
            targetUtilizationPercent:50,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60)
        })

        const writeScale = this.table.autoScaleWriteCapacity({
            maxCapacity: 4,
            minCapacity: 1
        })

        writeScale.scaleOnUtilization({
            targetUtilizationPercent:30,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60)
        })
        */
    }
}