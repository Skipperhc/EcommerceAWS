import { Callback, Context, PreAuthenticationTriggerEvent } from "aws-lambda";

export async function handler(event: PreAuthenticationTriggerEvent, context: Context, callback: Callback): Promise<void> {
    console.log(event)
    
    //verificando se o usuário que está tentando se logar tem alguma pendencia de qualquer tipo
    if(event.request.userAttributes.email === "vitorhainosz2@gmail.com") {
        callback("This user is blocked. Reason: PAYMENT", event)
    } else {
        callback(null, event)
    }
}