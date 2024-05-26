export enum ProductEvetnType {
    CREATED = "PRODUCT_CREATED",
    UPDATED = "PRODUCT_UPDATED",
    DELETED = "PRODUCT_DELETED",
}

export interface ProductEvent {
    requestId: string;
    eventType: ProductEvetnType;
    productId: string;
    productCode: string;
    productPrice: number;
    email: string;
}
