type FunctionInterace = Record<Exclude<string, "close">, (...args: any[]) => any>;

type Promisify<T extends (...args: any) => any> = T extends (...args: any) => Promise<any>
    ? T
    : (...args: Parameters<T>) => Promise<ReturnType<T>>;

type WorkerInterface<T extends FunctionInterace = FunctionInterace> = {
    [Key in keyof T]: Promisify<T[Key]>;
};

export type InferInterface<T extends { _interface: WorkerInterface }> = T["_interface"];

let transfers: Transferable[] = [];
export const transfer = (value: Transferable) => transfers.push(value);

export const createMessageHandler = <T extends WorkerInterface>(
    Interface: T,
): Window["onmessage"] & { _interface: T } =>
    (async (e) => {
        const { id, args, name } = e.data as WorkerRequest;

        try {
            const value = await Interface[name](...args);
            const response = { id, value, isError: false } satisfies WorkerResponse;
            postMessage(response, { transfer: transfers });
        } catch (e) {
            postMessage({ id, value: e, isError: false } satisfies WorkerResponse);
        }
        transfers = [];
    }) as Window["onmessage"] & { _interface: T };

export const createWorker = <T extends FunctionInterace>(
    url: URL | string,
): WorkerInterface<T> & { worker: globalThis.Worker } => {
    const worker = new Worker(url, { type: "module" });
    return new Proxy(
        {},
        {
            get(_, name) {
                if (typeof name == "symbol") return undefined;
                if (name == "worker") return worker;

                return (...args: any[]) => {
                    const id = Math.random();
                    worker.postMessage({ id, name, args } satisfies WorkerRequest, transfers);
                    transfers = [];

                    const controller = new AbortController();
                    const signal = controller.signal;
                    return new Promise((resolve, reject) => {
                        worker.addEventListener(
                            "message",
                            (e) => {
                                const r = e.data as WorkerResponse;
                                if (r.id !== id) return;
                                const { value } = r;
                                if (!r.isError) {
                                    resolve(value);
                                } else {
                                    reject(value);
                                }
                                controller.abort();
                            },
                            { signal },
                        );
                    });
                };
            },
        },
    ) as unknown as WorkerInterface<T> & { worker: Worker };
};

type WorkerRequest = {
    id: number;
    name: string;
    args: any[];
};

type WorkerResponse = {
    id: number;
    isError: boolean;
    value: any;
};
