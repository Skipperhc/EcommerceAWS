import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as ssm from 'aws-cdk-lib/aws-ssm'

export class OrdersAppLayersStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?:cdk.StackProps) {
        super(scope, id, props)

        const ordersLayer = new lambda.LayerVersion(this, 'OrdersLayer', {
            // compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            code:lambda.Code.fromAsset('lambda/orders/layers/ordersLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            layerVersionName: 'OrdersLayer',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })

        new ssm.StringParameter(this, 'OrdersLayerVersionArn', {
            parameterName: 'OrderLayerVersionArn',
            stringValue: ordersLayer.layerVersionArn
        })

        const ordersApiLayer = new lambda.LayerVersion(this, 'OrdersApiLayer', {
            // compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            code:lambda.Code.fromAsset('lambda/orders/layers/ordersApiLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            layerVersionName: 'OrdersApiLayer',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })

        new ssm.StringParameter(this, 'OrdersApiLayerVersionArn', {
            parameterName: 'OrdersApiLayerVersionArn',
            stringValue: ordersApiLayer.layerVersionArn
        })

        const orderEventsLayer = new lambda.LayerVersion(this, 'OrderEventsLayer', {
            // compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            code:lambda.Code.fromAsset('lambda/orders/layers/orderEventsLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            layerVersionName: 'OrderEventsLayer',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })

        new ssm.StringParameter(this, 'OrderEventsLayerVersionArn', {
            parameterName: 'OrderEventsLayerVersionArn',
            stringValue: orderEventsLayer.layerVersionArn
        })
    }
}