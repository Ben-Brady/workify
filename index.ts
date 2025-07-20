type Promisify<T extends (...args: any) => any> = T extends (...args: any) => Promise<any>
    ? T
    : (...args: Parameters<T>) => Promise<ReturnType<T>>;

export type FunctionInterface = Record<string, (...args: any[]) => any>;

export type WorkerInterface<T extends FunctionInterface = FunctionInterface> = {
    [Key in keyof T]: Promisify<T[Key]>;
};

export type InferInterface<T extends { _api: FunctionInterface }> = WorkerInterface<T["_api"]>;

let transfers: Transferable[] = [];
export const transfer = (value: Transferable) => transfers.push(value);

type WorkerRequest = [id: number, name: string, args: any[]];
type WorkerResponse = [id: number, value: any, isError: boolean];

export const createMessageHandler = <T extends FunctionInterface>(
    Interface: T,
): Window["onmessage"] & { _api: T } =>
    (async (e) => {
        const [id, name, args] = e.data as WorkerRequest;
        try {
            const value = await Interface[name](...args);
            const response = [id, value, false] satisfies WorkerResponse;
            postMessage(response, { transfer: transfers });
        } catch (err) {
            postMessage([id, err, true] satisfies WorkerResponse);
        }
        transfers = [];
    }) as Window["onmessage"] & { _api: T };

export const createWorker = <T extends WorkerInterface>(
    url: URL | string,
): [module: T, worker: globalThis.Worker] => {
    const worker = new Worker(url, { type: "module" });

    const api = new Proxy(
        {},
        {
            get(_, name) {
                name = name as string;
                return (...args: any[]) => {
                    const id = Math.random();
                    worker.postMessage([id, name, args] satisfies WorkerRequest, transfers);
                    transfers = [];

                    return new Promise((resolve, reject) => {
                        const onMessage = (ev: MessageEvent<any>) => {
                            const [requestId, value, isError] = ev.data;

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

export const createWorkerPool = <T extends WorkerInterface>(
    workerUrl: string,
    size: number = navigator.hardwareConcurrency,
): [api: T, workers: globalThis.Worker[]] => {
    const workers = Array.from({ length: size }, () => createWorker<T>(workerUrl));
    const workerObjects = workers.map((v) => v[1]);

    let index = 0;
    const api = new Proxy(
        {},
        {
            get:
                (_, name: string) =>
                // Need to do a wrapper function, so [].map(pool.foo) isn't the same call
                (...args: any[]) => {
                    index = (index + 1) % size;
                    const api = workers[index][0];
                    const func = api[name as any];
                    return func(...args);
                },
        },
    ) as T;

    return [api, workerObjects];
};
