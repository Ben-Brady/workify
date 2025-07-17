# Workify

Workify is minimal tool for creating web worker interfaces with a 1kb bundle size (500b gzipped)

```
npm install @nnilky/workify
yarn install @nnilky/workify
pnpm install @nnilky/workify
bun install @nnilky/workify
```

```ts
import { createWorker } from "./index";
import type { Interface } from "./worker";

const worker = createWorker<Interface>(new URL("./worker.ts", import.meta.url));
const result = await worker.add(1, 2);
console.log(`1 + 2 = ${result}`);
```

```ts
// worker.ts
import { createMessageHandler, InferInterface } from "./index";

const add = (a: number, b: number) => a + b;

const handler = createMessageHandler({ add });
export type Interface = InferInterface<typeof handler>;
onmessage = handler;
```

## Referencing the Worker

Getting the worker to bundle correctly is a bit finicky.

If your using vite, I recommend using their url import syntax

```ts
import WorkerURL from "./worker?url&worker";

const worker = createWorker(WorkerURL);
```

otherwise, use `URL("./path-to-worker", import.meta.url)`

```ts
const WorkerURL = new URL("./worker", import.meta.url);
const worker = createWorker(WorkerURL);
```

Please consult your bundlers documentation:

-   [Vite Web Workeras](https://vite.dev/guide/features.html#web-workers)
-   [Webpack Web Workers](https://webpack.js.org/guides/web-workers/)
