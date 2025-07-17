import { createWorker } from "./index";
import type { Interface } from "./worker";

const worker = createWorker<Interface>(new URL("./worker.ts", import.meta.url));
const result = await worker.add(1, 2);
console.log(`1 + 2 = ${result}`);
