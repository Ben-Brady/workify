type Promisify<T extends (...args: any) => any> = T extends (...args: any) => Promise<any>
    ? T
    : (...args: Parameters<T>) => Promise<ReturnType<T>>;

export type FunctionInterface = Record<string, (...args: any[]) => any>;

export type WorkerInterface<T extends FunctionInterface = FunctionInterface> = {
    [Key in keyof T]: Promisify<T[Key]>;
};

/**
 * Used to infer the function interface of a workify endpoint
 *
 * ```ts
 * export type Interface = InferInterface<typeof handler>;
 * ```
 */
export type InferInterface<T extends { _api: FunctionInterface }> = WorkerInterface<T["_api"]>;

let transfers: Transferable[] = [];

/**
 * Used to transfer objects to next worker request/reponse
 *
 * ### Request
 *
 * ```ts
 * const [api] = createWorker("./worker")
 * transfer(image)
 * api.enocdeImage(image)
 * ```
 *
 * ### Response
 *
 * ```ts
 * const generateImage(image) {
 *     const thumbnail = createThumbnail(image)
 *     transfer(thumbnail)
 *     return thumbnail
 * }
 * ```
 *
 * **Note**: You should only call this directly before a request/response to avoid race conditions
 */
export const transfer = (value: Transferable) => transfers.push(value);

type WorkerRequest = [id: symbol, name: string, args: any[]];
type WorkerResponse = [id: symbol, value: any, isError: boolean];

/**
 * Creates an `onmessage` handler for workify requests
 *
 * ### Example
 *
 * ```ts
 * import { createMessageHandler, type InferInterface } from "@nnilky/workify";
 *
 * const add = (a: number, b: number) => a + b;
 *
 * const handler = createMessageHandler({ add });
 * export type Interface = InferInterface<typeof handler>;
 * onmessage = handler;
 * ```
 */
export const createMessageHandler = <T extends FunctionInterface>(
    Interface: T,
): Window["onmessage"] & { _api: T } =>
    (async (e) => {
        let [id, name, args] = e.data as WorkerRequest;
        try {
            let value = await Interface[name](...args);
            let response = [id, value, false] satisfies WorkerResponse;
            postMessage(response, { transfer: transfers });
        } catch (err) {
            postMessage([id, err, true] satisfies WorkerResponse);
        }
        transfers = [];
    }) as Window["onmessage"] & { _api: T };

/**
 * Creates a worker that uses a workify interface
 *
 * ### Example
 *
 * ```ts
 * import { createWorker } from "@nnilky/workify";
 *
 * const url = new URL("./worker.ts", import.meta.url)
 * const [api, worker] = createWorker(url);
 * ```
 *
 * If you want proper typing, you should use the infered interface
 *
 * ```ts
 * import { createWorker } from "@nnilky/workify";
 * import type { Interface } from "./worker";
 *
 * const workerUrl = new URL("./worker.ts", import.meta.url)
 * const [api] = createWorker<Interface>(workerUrl);
 * ```
 */
export const createWorker = <T extends WorkerInterface>(
    url: URL | string,
): [module: T, worker: globalThis.Worker] => {
    let worker = new Worker(url, { type: "module" });

    let api = new Proxy(
        {},
        {
            get(_, name) {
                name = name as string;
                return (...args: any[]) => {
                    let id = Symbol();
                    worker.postMessage([id, name, args] satisfies WorkerRequest, transfers);
                    transfers = [];

                    return new Promise((resolve, reject) => {
                        let onMessage = (ev: MessageEvent<any>) => {
                            let [requestId, value, isError] = ev.data;

                            if (requestId !== id) return;
                            if (!isError) {
                                resolve(value);
                            } else {
                                reject(value);
                            }
                            worker.removeEventListener("message", onMessage);
                        };
                        worker.addEventListener("message", onMessage);
                    });
                };
            },
        },
    ) as T;

    return [api, worker];
};

/**
 * Creates a worker that uses a workify interface
 *
 * ### Example
 *
 * ```ts
 * import { createWorkerPool } from "@nnilky/workify";
 *
 * const url = new URL("./worker.ts", import.meta.url)
 * const [api, workers] = createWorkerPool(url, 8);
 * ```
 *
 * If you want proper typing, you should use the infered interface
 *
 * ```ts
 * import { createWorkerPool } from "@nnilky/workify";
 * import type { Interface } from "./worker";
 *
 * const workerUrl = new URL("./worker.ts", import.meta.url)
 * const [api] = createWorkerPool<Interface>(workerUrl);
 * ```
 */
export const createWorkerPool = <T extends WorkerInterface>(
    workerUrl: string,
    size: number = navigator.hardwareConcurrency,
): [api: T, workers: globalThis.Worker[]] => {
    let workers = Array.from({ length: size }, () => createWorker<T>(workerUrl));
    let workerObjects = workers.map((v) => v[1]);

    let index = 0;
    let api = new Proxy(
        {},
        {
            get:
                (_, name: string) =>
                // Need to do a wrapper function, so [].map(pool.foo) isn't the same call
                (...args: any[]) => {
                    index = (index + 1) % size;
                    let api = workers[index][0];
                    let func = api[name as any];
                    return func(...args);
                },
        },
    ) as T;

    return [api, workerObjects];
};
