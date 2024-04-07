import { DocumentClient } from "aws-sdk/clients/dynamodb"
import { v4 as uuid } from "uuid"

export interface Product {
    id: string;
    productName: string;
    code: string;
    price: number;
    model: string;
    productUrl: string;
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

    //Irei retornar o produto completo por conta do id, recebemos sem id, devolvemos com id gerado
    async create(product: Product): Promise<Product>{
        product.id = uuid()
        await this.ddbClient.put({
            TableName: this.productsDdb,
            Item: product //Podemos especificar cada coluna da tabela, mas por estarmos utilizando uma interface com os campos já criados, podemos apenas passar o produto para o put
        }).promise()
        return product //retornamos o produto com o id
    }

    async deleteProduct(productId: string): Promise<Product> {
        const data = await this.ddbClient.delete({
            TableName: this.productsDdb,
            Key: {
                id: productId
            },
            ReturnValues: "ALL_OLD" //Está configuração normalmente é NONE, ela irá trazer todos os dados do produto excluido
        }).promise()
        //Caso não tenha nenhum valor nesses attributes, significa que não foi deletado nenhum produto do banco de dados
        if(data.Attributes) {
            return data.Attributes as Product
        } else {
            throw new Error('Product not found')
        }
    }

    async updateProduct(productId: string, product: Product): Promise<Product> {
        const data = await this.ddbClient.update({
            TableName: this.productsDdb,
            Key: {
                id: productId
            },
            ConditionExpression: 'attribute_exists(id)', //Essa é uma trava, ela só vai fazer a alteração na tabela caso o produto possua um id, ou seja, se não encontrar nenhum produto não vai criar nem alterar nada
            ReturnValues: 'UPDATED_NEW', //Iremos retornar os dados atualizados do produto, vai estar novamente no campo Attributes
            UpdateExpression: "set productName = :n, code = :c, price = :p, model = :m, productUrl = :u", //Definimos uma query que será a resposável por atualizar o produto, no caso, definimos o campo que será atualizado e o dado novo
            ExpressionAttributeValues: { //Aqui definimos o significado de cada um dos itens acima
                ":n": product.productName,
                ":c": product.code,
                ":p": product.price,
                ":m": product.model,
                ":u": product.productUrl
            }
        }).promise()
        data.Attributes!.id = productId //Caso não mandem um productId, essa linha irá estourar um erro que poderemos tratar depois
        return data.Attributes as Product //Retornamos o produto com os campos atualizados
    }
}