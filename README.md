# Workify

Workify is minimal tool for creating web worker interfaces coming at 540b minified (340b gzipped)

```
npm install @nnilky/workify
yarn install @nnilky/workify
pnpm install @nnilky/workify
bun install @nnilky/workify
```

```ts
import { createWorker } from "@nnilky/workify";
import type { Interface } from "./worker";

const worker = createWorker<Interface>(new URL("./worker.ts", import.meta.url));
const result = await worker.add(1, 2);
console.log(`1 + 2 = ${result}`);
```

```ts
// worker.ts
import { createMessageHandler, InferInterface } from "@nnilky/workify";

const add = (a: number, b: number) => a + b;

const handler = createMessageHandler({ add });
export type Interface = InferInterface<typeof handler>;
onmessage = handler;
```


## How it works

Under the when you try to call a method on a worker, the access is proxied any only the function name and args are sent to the worker, this is then recieved on the other end and mapped to the correct function.

While this works without the decleration just find, it's highly recommended to use this in order to be able to see what methods a worker has.

```ts
import { createWorker } from "@nnilky/workify";
import type { Interface } from "./worker";

const worker = createWorker<Interface>(new URL("./worker.ts", import.meta.url));
const result = await worker.add(1, 2);
console.log(`1 + 2 = ${result}`);
```

```ts
// worker.ts
import { createMessageHandler, InferInterface } from "@nnilky/workify";

const add = (a: number, b: number) => a + b;

const handler = createMessageHandler({ add });
export type Interface = InferInterface<typeof handler>;
onmessage = handler;
```

## Transfers

In order to transfer objects to and from workers, use `transfer()`

```ts
// in client
import { transfer } from "@nnilky/workify";

const worker = createWorker(new URL("./worker", import.meta.url));

    const canvas = new OffscreenCanvas(100,100)
    const image = canvas.transferToImageBitmap()
transfer(image)
worker.resizeImage(image)
```

```ts
// in worker
import { transfer } from "@nnilky/workify";

const createImage = () => {
    const canvas = new OffscreenCanvas(100,100)
    const image = canvas.transferToImageBitmap()

    transfer(image)
    return image
}

const handler = createMessageHandler({ createImage });
export type Interface = InferInterface<typeof handler>;
onmessage = handler;
```

This works under the hood by creating a list of values that are included in the transfers in the next request/reponse.

Because of this, It's critical you do this right before the call to worker or returning from a worker.
This to avoid any race conditions with async.

```ts
// ❌ Incorrect
const image = await createImage()
transfer(image)
const thumbnail = await generateThumbnail(image)
transfer(thumbnail)
return { image, thumbnail }

// ✔️ Correct
const image = await createImage()
const thumbnail = await generateThumbnail(image)
transfer(image)
transfer(thumbnail)
return { image, thumbnail }
```

## Bundling the Worker

Getting the worker to bundle correctly is a bit finicky.

If your using Vite, I recommend using their url import syntax

```ts
import WorkerURL from "./worker?url&worker";

const worker = createWorker(WorkerURL);
```

otherwise, the recommended way is to use `new URL("./path-to-worker", import.meta.url)`

```ts
const WorkerURL = new URL("./worker", import.meta.url);
const worker = createWorker(WorkerURL);
```

However, please consult your bundlers documentation for proper instructions:

-   [Vite Web Workeras](https://vite.dev/guide/features.html#web-workers)
-   [Webpack Web Workers](https://webpack.js.org/guides/web-workers/)
