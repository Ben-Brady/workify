import { createMessageHandler, InferInterface } from "./index";

const add = (a: number, b: number) => a + b;

const handler = createMessageHandler({ add });
export type Interface = InferInterface<typeof handler>;
onmessage = handler;
