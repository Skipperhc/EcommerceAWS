import { DocumentClient } from "aws-sdk/clients/dynamodb"
import { v4 as uuid } from "uuid"

export interface Product {
    id: string;
    productName: string;
    code: string;
    price: number;
    model: string;
}

export class ProductRepository {
    private ddbClient: DocumentClient
    private productsDdb: string

    constructor(ddbClient: DocumentClient, productsDdb: string) {
        this.ddbClient = ddbClient;
        this.productsDdb = productsDdb;
    }

    //Irá retornar todos os produtos cadastrados no banco de dados
    async getAllProducts(): Promise<Product[]> {
        const data = await this.ddbClient.scan({
            TableName: this.productsDdb
        }).promise()
        return data.Items as Product[] //Transformei a resposta em uma lista de Produtos
    }

    //Irá retornar um produto que tenha o id solicitado, caso não encontre irá lançar um erro
    async getProductById(productId: string): Promise<Product> {
        const data = await this.ddbClient.get({
            TableName: this.productsDdb,
            Key: {
                id: productId //Tem de ser o mesmo nome que está no banco de dados 
            }
        }).promise()
        //Retornando ou não um produto, terá um resultado diferente
        if (data.Item) {
            return data.Item as Product
        } else {
            throw new Error('Product not found')
        }
    }
}