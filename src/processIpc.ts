export const ADAPTER_IPC_EVENT = "adapter:event";
export const ADAPTER_EVENT_INVALID_TOKEN = "fluxer-invalid-token";

export function sendAdapterEvent(event: string) {
    const message = {
        type: ADAPTER_IPC_EVENT,
        event
    };

    const adapterProcess = process as NodeJS.Process & {
        send?: (msg: unknown) => void;
        parentPort?: { postMessage: (msg: unknown) => void };
    };

    try {
        if (typeof adapterProcess.send === "function") {
            adapterProcess.send(message);
        }
    } catch {}

    try {
        adapterProcess.parentPort?.postMessage(message);
    } catch {}
}
