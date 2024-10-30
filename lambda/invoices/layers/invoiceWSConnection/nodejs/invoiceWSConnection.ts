import { ApiGatewayManagementApi } from "aws-sdk";

export class InvoiceWSService {
    private apigwManagementApi: ApiGatewayManagementApi

    constructor(apigwManagementApi: ApiGatewayManagementApi) {
        this.apigwManagementApi = apigwManagementApi
    }

    async sendData(connectionId: string, data: string): Promise<boolean> {
        //O try catch serve para quando tentarmos enviar uma mensagem para um usuário que se desconectou
        try {
            //Esse getConnection pode n trazer nada (o usuário está conectado) ou disparar um erro (usuário desconectado)
            await this.apigwManagementApi.getConnection({
                ConnectionId: connectionId
            }).promise()
            
            //Enviando qualquer coisa que chegar para o usuário
            await this.apigwManagementApi.postToConnection({
                ConnectionId: connectionId,
                Data: data
            }).promise()

            return true
        } catch (error) {
            console.error(error)
            return false
        }
    }
}