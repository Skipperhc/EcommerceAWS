import * as cdk from "aws-cdk-lib"
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import * as cwlogs from 'aws-cdk-lib/aws-logs'
import * as cognito from "aws-cdk-lib/aws-cognito"
import * as lambda from "aws-cdk-lib/aws-lambda"
import * as iam from "aws-cdk-lib/aws-iam"
import { Construct } from "constructs"

//para não ter de ficar adicionando vários parametros, criamos uma interface que vai ter os dados que precisamos, é um objeto com todos os parametros que queremos
interface ECommerceApiStackProps extends cdk.StackProps {
    productsFetchHandler: lambdaNodeJS.NodejsFunction;
    productsAdminHandler: lambdaNodeJS.NodejsFunction;
    ordersHandler: lambdaNodeJS.NodejsFunction;
    orderEventsFetchHandler: lambdaNodeJS.NodejsFunction;
}

export class ECommerceApiStack extends cdk.Stack {
    private productsAuthorizer: apigateway.CognitoUserPoolsAuthorizer
    private productsAdminAuthorizer: apigateway.CognitoUserPoolsAuthorizer
    private customerPool: cognito.UserPool
    private adminPool: cognito.UserPool

    constructor(scope: Construct, id: string, props: ECommerceApiStackProps) {
        super(scope, id, props)

        const logGroup = new cwlogs.LogGroup(this, "ECommerceApiLogs")

        const api = new apigateway.RestApi(this, "ECommerceApi", {
            restApiName: "ECommerceApi",
            cloudWatchRole: true,
            deployOptions: {
                accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
                    httpMethod: true,
                    ip: true,
                    protocol: true,
                    requestTime: true,
                    resourcePath: true,
                    responseLength: true,
                    status: true,
                    caller: true,
                    user: true
                })
            }
        })

        this.createCognitoAuth(props, api)

        const adminUserPolicyStatement = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["cognito-idp:AdminGetUser"],
            resources: [this.adminPool.userPoolArn]
        })
        const adminUserPolicy = new iam.Policy(this, "AdminGetUserPolicy", {
            statements: [adminUserPolicyStatement]
        })
        adminUserPolicy.attachToRole(<iam.Role> props.productsAdminHandler.role)

        //aqui usamos os parametros passado pelo props, no caso um meio de apontar para a stack de produtos
        this.createProductsService(props, api)
        this.createOrdersService(props, api)
    }

    private createCognitoAuth(props: ECommerceApiStackProps, api: cdk.aws_apigateway.RestApi) {

        const postConfirmationHandler = new lambdaNodeJS.NodejsFunction(this, "PostConfirmationFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "PostConfirmationFunction",
            entry: "lambda/auth/postConfirmationFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
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

        const preAuthenticationHandler = new lambdaNodeJS.NodejsFunction(this, "PreAuthenticationFunction", {
            // runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "PreAuthenticationFunction",
            entry: "lambda/auth/preAuthenticationFunction.ts", //Qual arquivo vai ser responsavel por tratar cada request que chegar nessa função
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

        //Cognito customer pool
        this.customerPool = new cognito.UserPool(this, "CustomerPool", {
            lambdaTriggers: {
                preAuthentication: preAuthenticationHandler,
                postAuthentication: postConfirmationHandler
            },
            userPoolName: "CustomerPool",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            selfSignUpEnabled: true,
            //Verificação da conta através do email, email de verificação que seeeeeempre recebo
            autoVerify: {
                email: true,
                phone: false
            },
            userVerification: {
                emailSubject: "Verify your email for the ECommerce service!",
                //4 tralhas é um codigo para onde colocar o link para verificar a conta
                emailBody: "Thanks for signing up to ECommerce service! Your verification code is {####}",
                emailStyle: cognito.VerificationEmailStyle.CODE
            },
            signInAliases: {
                username: false,
                email: true
            },
            standardAttributes: {
                fullname: {
                    required: true,
                    mutable: false
                },
                //Se der um ctrl+espaço temos vários exemplos de atributos padrões como nome, email, telefone, aniversario, etc
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireDigits: true,
                requireSymbols: true,
                requireUppercase: true,
                tempPasswordValidity: cdk.Duration.days(3)
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY
        })

        //Cognito Admin pool
        this.adminPool = new cognito.UserPool(this, "AdminPool", {
            userPoolName: "AdminPool",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            selfSignUpEnabled: false,
            userInvitation: {
                emailSubject: "Welcome to ECommerce administrator service",
                emailBody: "Your username is {username} and temporary password is {####}"
            },
            //Verificação da conta através do email, email de verificação que seeeeeempre recebo
            signInAliases: {
                username: false,
                email: true
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: false
                },
                //Se der um ctrl+espaço temos vários exemplos de atributos padrões como nome, email, telefone, aniversario, etc
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: true,
                requireDigits: true,
                requireSymbols: true,
                requireUppercase: true,
                tempPasswordValidity: cdk.Duration.days(3)
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY
        })

        this.customerPool.addDomain("CustomerDomain", {
            cognitoDomain: {
                domainPrefix: "vhc-customer-service"
            }
        })

        this.adminPool.addDomain("AdminDomain", {
            cognitoDomain: {
                domainPrefix: "vhc-admin-service"
            }
        })

        //Escopo para definir quais endpoints um cliente pode acessar
        const customerWebScope = new cognito.ResourceServerScope({
            scopeName: "web",
            scopeDescription: "Customer Web operation"
        })

        const customerMobileScope = new cognito.ResourceServerScope({
            scopeName: "mobile",
            scopeDescription: "Customer Mobile operation"
        })

        const adminWebScope = new cognito.ResourceServerScope({
            scopeName: "web",
            scopeDescription: "Admin Web operation"
        })

        const customerResourceServer = this.customerPool.addResourceServer("CustomerResourceServer", {
            identifier: "customer",
            userPoolResourceServerName: "CustomerResourceServer",
            scopes: [customerMobileScope, customerWebScope]
        })

        const adminResourceServer = this.adminPool.addResourceServer("AdminResourceServer", {
            identifier: "admin",
            userPoolResourceServerName: "AdminResourceServer",
            scopes: [adminWebScope]
        })

        this.customerPool.addClient("customer-web-client", {
            userPoolClientName: "customerWebClient",
            authFlows: {
                userPassword: true,
            },
            accessTokenValidity: cdk.Duration.minutes(60),
            refreshTokenValidity: cdk.Duration.days(7),
            oAuth: {
                //Quando o cliente chegar aqui pelo caminho WEB, vai ter o scope da web
                scopes: [cognito.OAuthScope.resourceServer(customerResourceServer, customerWebScope)]
            }
        })

        this.customerPool.addClient("customer-mobile-client", {
            userPoolClientName: "customerMobileClient",
            authFlows: {
                userPassword: true,
            },
            accessTokenValidity: cdk.Duration.minutes(60),
            refreshTokenValidity: cdk.Duration.days(7),
            oAuth: {
                //Quando o cliente chegar aqui pelo caminho MOBILE, vai usar o scope para o mobile
                scopes: [cognito.OAuthScope.resourceServer(customerResourceServer, customerMobileScope)]
            }
        })

        this.adminPool.addClient("admin-web-client", {
            userPoolClientName: "adminWebClient",
            authFlows: {
                userPassword: true,
            },
            accessTokenValidity: cdk.Duration.minutes(60),
            refreshTokenValidity: cdk.Duration.days(7),
            oAuth: {
                //Quando o cliente chegar aqui pelo caminho WEB, vai ter o scope da web
                scopes: [cognito.OAuthScope.resourceServer(adminResourceServer, adminWebScope)]
            }
        })

        //Aqui temos o exemplo de duas situações diferentes 
        this.productsAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, "ProductsAuthorizer", {
            authorizerName: "ProductsAuthorizer",
            cognitoUserPools: [this.customerPool, this.adminPool]
        })

        this.productsAdminAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, "ProductsAdminAuthorizer", {
            authorizerName: "ProductsAdminAuthorizer",
            cognitoUserPools: [this.adminPool]
        })
    }

    private createOrdersService(props: ECommerceApiStackProps, api: cdk.aws_apigateway.RestApi) {
        const ordersIntegration = new apigateway.LambdaIntegration(props.ordersHandler)

        //resource - -/orders
        const ordersResorce = api.root.addResource('orders')

        //GET /orders
        //GET /orders?email=matilde@email.com
        //GET /orders?email=matilde@email.com&orderId=123
        ordersResorce.addMethod("GET", ordersIntegration)

        const orderDeletionValidator = new apigateway.RequestValidator(this, "OrderDeletionValidator", {
            restApi: api,
            requestValidatorName: "OrderDeletionValidator",
            validateRequestParameters: true,
        })

        //DELETE /orders?email=matilde@email.com&orderId=123
        ordersResorce.addMethod("DELETE", ordersIntegration, {
            requestParameters: {
                'method.request.querystring.email': true,
                'method.request.querystring.orderId': true
            },
            requestValidator: orderDeletionValidator
        })

        //POST /orders
        const orderRequestValidator = new apigateway.RequestValidator(this, "OrderRequestValidator", {
            restApi: api,
            requestValidatorName: "Order request validator",
            validateRequestBody: true
        })

        const orderModel = new apigateway.Model(this, "OrderModel", {
            modelName: "OrderModel",
            restApi: api,
            schema: {
                type: apigateway.JsonSchemaType.OBJECT,
                properties: {
                    email: {
                        type: apigateway.JsonSchemaType.STRING
                    },
                    productIds: {
                        type: apigateway.JsonSchemaType.ARRAY,
                        minItems: 1,
                        items: {
                            type: apigateway.JsonSchemaType.STRING
                        }
                    },
                    payment: {
                        type: apigateway.JsonSchemaType.STRING,
                        enum: ["CASH", "DEBIT_CARD", "CREDIT_CARD"]
                    },
                    shipping: {
                        type: apigateway.JsonSchemaType.OBJECT,
                        properties: {
                            type: {
                                type: apigateway.JsonSchemaType.STRING,
                                enum: ["ECONOMIC", "URGENT"]
                            },
                            carrier: {
                                type: apigateway.JsonSchemaType.STRING,
                                enum: ["CORREIOS", "FEDEX"]
                            }
                        }
                    },
                },
                required: [
                    "email",
                    "productIds",
                    "payment",
                    "shipping"
                ]
            }
        })

        ordersResorce.addMethod("POST", ordersIntegration, {
            requestValidator: orderRequestValidator,
            requestModels: {
                "application/json": orderModel
            }
        })

        // /orders/events
        const orderEventsResourse = ordersResorce.addResource("events")
        const orderEventsFetchValidator = new apigateway.RequestValidator(this, "OrderEventsFetchValidator", {
            restApi: api,
            requestValidatorName: "OrderEventsFetchValidator",
            validateRequestParameters: true
        })

        const orderEventsFunctionIntegration = new apigateway.LambdaIntegration(props.orderEventsFetchHandler)

        //GET /orders/events?email=GSIteste@hotmail.com
        //GET /orders/events?email=GSIteste@hotmail.com&eventType=ORDER_CREATED
        orderEventsResourse.addMethod("GET", orderEventsFunctionIntegration, {
            requestParameters: {
                'method.request.querystring.email': true,
                'method.request.querystring.eventType': false
            },
            requestValidator: orderEventsFetchValidator
        })

    }


    private createProductsService(props: ECommerceApiStackProps, api: cdk.aws_apigateway.RestApi) {
        const productsFetchIntegration = new apigateway.LambdaIntegration(props.productsFetchHandler)

        const productsFetchWebMobileIntegrationOption = {
            authorizer: this.productsAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
            authorizationScopes: ["customer/web", "customer/mobile", "admin/web"]
        }

        // GET "/products"
        const productsResource = api.root.addResource("products")
        productsResource.addMethod("GET", productsFetchIntegration, productsFetchWebMobileIntegrationOption)

        const productsFetchWebIntegrationOption = {
            authorizer: this.productsAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
            authorizationScopes: ["customer/web", "admin/web"]
        }

        // GET /products/{id}
        const productIdResource = productsResource.addResource("{id}")
        productIdResource.addMethod("GET", productsFetchIntegration, productsFetchWebIntegrationOption)

        const productsAdminIntegration = new apigateway.LambdaIntegration(props.productsAdminHandler)
        
        // POST /products
        const productRequestValidator = new apigateway.RequestValidator(this, "ProductRequestValidator", {
            restApi: api,
            requestValidatorName: "Product request validator",
            validateRequestBody: true
        })

        const productModel = new apigateway.Model(this, "ProductModel", {
            modelName: "ProductModel",
            restApi: api,
            schema: {
                type: apigateway.JsonSchemaType.OBJECT,
                properties: {
                    productName: {
                        type: apigateway.JsonSchemaType.STRING
                    },
                    code: {
                        type: apigateway.JsonSchemaType.STRING
                    },
                    model: {
                        type: apigateway.JsonSchemaType.STRING,
                    },
                    productUrl: {
                        type: apigateway.JsonSchemaType.STRING,
                    },
                    price: {
                        type: apigateway.JsonSchemaType.NUMBER,
                    },
                },
                required: [
                    "productName",
                    "code",
                ]
            }
        })

        //POST /products
        productsResource.addMethod("POST", productsAdminIntegration, {
            requestValidator: productRequestValidator,
            requestModels: {
                "application/json": productModel
            }, 
            authorizer: this.productsAdminAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
            authorizationScopes: ["admin/web"]
        })

        // PUT /products/{id}
        productIdResource.addMethod("PUT", productsAdminIntegration, {
            requestValidator: productRequestValidator,
            requestModels: {
                "application/json": productModel
            },
            authorizer: this.productsAdminAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
            authorizationScopes: ["admin/web"]
        })

        // DELETE /products/{id}
        productIdResource.addMethod("DELETE", productsAdminIntegration, {
            authorizer: this.productsAdminAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
            authorizationScopes: ["admin/web"]
        })
    }
}
