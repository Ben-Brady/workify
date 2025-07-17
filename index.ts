type Promisify<T extends (...args: any) => any> = T extends (...args: any) => Promise<any>
    ? T
    : (...args: Parameters<T>) => Promise<ReturnType<T>>;

export type FunctionInteface = Record<Exclude<string, "close">, (...args: any[]) => any>;

export type WorkerifyInterface<T extends FunctionInteface = FunctionInteface> = {
    [Key in keyof T]: Promisify<T[Key]>;
};

export type InferInterface<T extends { _interface: WorkerifyInterface }> = T["_interface"];

let transfers: Transferable[] = [];
export const transfer = (value: Transferable) => transfers.push(value);

export const createMessageHandler = <T extends WorkerifyInterface>(
    Interface: T,
): Window["onmessage"] & { _interface: T } =>
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
    }) as Window["onmessage"] & { _interface: T };

export const createWorker = <T extends FunctionInteface>(
    url: URL | string,
): WorkerifyInterface<T> & { worker: globalThis.Worker } => {
    const worker = new Worker(url, { type: "module" });
    return new Proxy(
        {},
        {
            get(_, name) {
                name = name as string;
                if (name == "worker") return worker;

                return (...args: any[]) => {
                    const id = Math.random();
                    worker.postMessage([id, name, args] satisfies WorkerRequest, transfers);
                    transfers = [];

                    return new Promise((resolve, reject) => {
                        const onMessage = (ev: MessageEvent<any>) => {
                            const [requestId, value, isError] = ev.data[1];

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
    ) as unknown as WorkerifyInterface<T> & { worker: Worker };
};

type WorkerRequest = [id: number, name: string, args: any[]];
type WorkerResponse = [id: number, value: any, isError: boolean];
