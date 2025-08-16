# Workify

A minimal tool for creating web workers APIs, weighting 740 bytes (430b gzipped).

```shell
npm install @nnilky/workify
```

https://www.npmjs.com/package/@nnilky/workify

## Example

```ts
// worker.ts
import { createMessageHandler, type InferInterface } from "@nnilky/workify";

const add = (a: number, b: number) => a + b;

const handler = createMessageHandler({ add });
export type Interface = InferInterface<typeof handler>;
onmessage = handler;
```

```ts
// client.ts
import { createWorker } from "@nnilky/workify";
import type { Interface } from "./worker";

const workerUrl = new URL("./worker.ts", import.meta.url)
const [api] = createWorker<Interface>(workerUrl);

const result = await api.add(1, 2);
console.log(`1 + 2 = ${result}`);
```

## Getting the Worker URL

Getting the worker to bundle correctly is a bit finicky.

If you are using Vite, I recommend using their url import syntax

```ts
import WorkerURL from "./worker?worker&url";

const [api] = createWorker(WorkerURL);
```

Otherwise, the recommended way is to use `new URL("./path-to-worker", import.meta.url)`

```ts
const WorkerURL = new URL("./worker", import.meta.url);
const [api] = createWorker(WorkerURL);
```

However, please consult your bundlers documentation for proper instructions:

- [Vite / Web Workers](https://vite.dev/guide/features.html#web-workers)
- [Webpack / Web Workers](https://webpack.js.org/guides/web-workers/)

## Worker Pool

You can construct a worker pool the same way you'd make a worker. You can optionally specify the number of workers to use with the default being `navigator.hardwareConcurrency`.

```ts
import { createWorkerPool } from "@nnilky/workify";
import type { Interface } from "./worker";

const [api] = createWorkerPool<Interface>(new URL("./worker", import.meta.url));

const promises = []
for (let i = 0; i < 16; i++) {
    promises.push(api.renderFrame(index))
}
const frames = await Promise.all(promises)
```

This just redirects each function call to a different worker round robin style.

## Transfers

In order to transfer objects to and from workers, use `transfer()`. You can only transfer types that are [Transferable](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects#supported_objects).

```ts
// In client
import { transfer } from "@nnilky/workify";

const [api] = createWorker(new URL("./worker", import.meta.url));

const canvas = new OffscreenCanvas(100,100)
const image = canvas.transferToImageBitmap()
transfer(image)
api.resizeImage(image)
```

```ts
// In a worker
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

Because of this, It's critical you do this right before sending a request/returning a response. This to avoid any race conditions caused by sending those objects with different request/response.

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

## Cleanup

In order to terminate workers when you don't need them, `createWorker` and `createWorkerPool` both return the actual workers as their second return value. You can use this in your framework to perform cleanup.

For example, in Solid.js it would look something like this:

```ts
const useWorker = <T extends WorkerInterface>(url: string): T => {
    const [api, worker] = createWorker<T>(url);
    onCleanup(() => worker.terminate())
    return api
}

const useWorkerPool = <T extends WorkerInterface>(url: string): T => {
    const [api, workers] = createWorkerPool<T>(url);
    onCleanup(() => workers.forEach(v => v.terminate())
    return api
}
```


## Customising Worker

If you want to have a non-request/response protocol on your worker, for instance reporting back updates to a task. You can add an if condition to the `onmessage` global for change how data is recieved.

```ts
// worker.js
import { createMessageHandler, type InferInterface } from "@nnilky/workify";
import { performLongTask } from "./custom";

const add = (a: number, b: number) => a + b;

const handler = createMessageHandler({ add });

export type Interface = InferInterface<typeof handler>;

onmessage = (e) => {
    if (e.data["myCustomSystem"]) {
        runCustomSystem(e)
    } else {
        handler(e);
    }
}
```

Or if you want to send data back, such as a progress report, you can just send it using a normal `postMesssage` call and attach an message listener to the exposed worker, workify will ignore any non-workify messages.

```ts
// worker.js
postMessage({ type:"progress-update", progress: 0 })
```

```ts
const [api, worker] = createWorker(WorkerURL)
worker.addEventListener("message", (e) => {
    if (e.data?.type !== "progress-update") return
    console.log(`Progress: ${e.data.progress}`)
})
```

## How it works

Under the hood, when you try to call a method on a worker, the reference to the function is proxied. Only the function name and arguments are sent to the worker, this is then recieved on the other end and mapped to the correct function.

The `Interface` generic lets you have a usable developer experience by providing proper typing to the proxy object.
