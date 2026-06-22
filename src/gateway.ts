import { WebSocket, WebSocketServer } from "ws";
import { DEFAULT_WEBSOCKET_PORT } from "./constants.ts";
import { Event as WaitableEvent } from "./util/event.ts";
import { IncomingMessage } from "node:http";
import { type GatewayCodec, JsonGatewayCodec, getCodec } from "./gateway/codecs.ts";
import { transformD2F } from "./gateway/transformerD2F.ts";
import { transformF2D, transformEmojiF2D } from "./gateway/transformerF2D.ts";
import { setEmojiUpdateListener } from "./emojiRegistry.ts";

const FLUXER_GATEWAY_URL = "wss://gateway.fluxer.app/?encoding=json&v=1";

type EventQueueItem =
    | { type: "clientMsg"; payload: any }
    | { type: "fluxerMsg"; payload: any }
    | { type: "clientClose"; code: number; reason: string }
    | { type: "fluxerClose"; code: number; reason: string }
    | { type: "error"; source: "client" | "fluxer"; error: Error };

interface GatewayQueryParams {
    encoding: "json" | "etf";
    v: string;
    compress: "none" | "zlib-stream" | "zstd-stream";
}

function getQueryParams(request: IncomingMessage): GatewayQueryParams {
    const fullUrl = new URL(request.url!, "http://localhost");
    const encoding = fullUrl.searchParams.get("encoding") ?? "json";
    const v = fullUrl.searchParams.get("v") ?? "9";
    const compress = fullUrl.searchParams.get("compress") ?? "none";

    if (encoding !== "json" && encoding !== "etf") {
        throw new Error("Invalid encoding");
    }
    if (compress !== "none" && compress !== "zlib-stream" && compress !== "zstd-stream") {
        throw new Error("Invalid compress");
    }

    return {
        encoding: encoding as "json" | "etf",
        v,
        compress: compress as "none" | "zlib-stream" | "zstd-stream"
    };
}

const clients = new Set<GatewayProxy>();

class GatewayProxy {
    cleanupCallback: () => void;
    ws: WebSocket;
    params: GatewayQueryParams;
    clientCodec: GatewayCodec;
    fluxerCodec: GatewayCodec;

    fluxerWs: WebSocket;
    #closed: boolean;
    #fluxerReady: boolean;
    #settingsProtoStoreKey: string | undefined;
    #lastSequence: number;
    #queue: Array<EventQueueItem>;
    #messageEvent: WaitableEvent;

    constructor(ws: WebSocket, params: GatewayQueryParams) {
        this.ws = ws;
        this.params = params;
        this.clientCodec = getCodec(params.encoding, params.compress);
        this.fluxerCodec = new JsonGatewayCodec();

        this.#closed = false;
        this.#fluxerReady = false;
        this.#settingsProtoStoreKey = undefined;
        this.#lastSequence = 0;
        this.#queue = [];
        this.#messageEvent = new WaitableEvent();
        this.cleanupCallback = () => {};

        console.log("[GatewayProxy] Client connected");

        this.ws.on("message", this.#onClientMessage.bind(this));
        this.ws.on("close", this.#onClientClose.bind(this));
        this.ws.on("error", this.#onClientError.bind(this));

        this.fluxerWs = new WebSocket(FLUXER_GATEWAY_URL);
        this.fluxerWs.on("open", this.#onFluxerOpen.bind(this));
        this.fluxerWs.on("message", this.#onFluxerMessage.bind(this));
        this.fluxerWs.on("close", this.#onFluxerClose.bind(this));
        this.fluxerWs.on("error", this.#onFluxerError.bind(this));

        this.#runQueue();
    }

    #onClientMessage(payload: any) {
        const decoded = this.clientCodec.decode(payload);
        console.log("[GatewayProxy/C->F]", JSON.stringify(decoded, null, 0));
        this.#queue.push({ type: "clientMsg", payload: decoded });
        this.#messageEvent.notify();
    }

    #sendToFluxer(payload: any) {
        if (!payload) return;
        this.fluxerWs.send(this.fluxerCodec.encode(payload));
    }

    #onFluxerMessage(payload: any) {
        const decoded = this.fluxerCodec.decode(payload);
        if (typeof decoded?.s === "number") {
            this.#lastSequence = Math.max(this.#lastSequence, decoded.s);
        }
        console.log("[GatewayProxy/F->C]", JSON.stringify(decoded, null, 0));
        this.#queue.push({ type: "fluxerMsg", payload: decoded });
        this.#messageEvent.notify();
    }

    #sendToClient(payload: any | any[] | undefined) {
        if (!payload) return;
        if (Array.isArray(payload)) {
            for (const item of payload) {
                this.ws.send(this.clientCodec.encode(item));
            }
        } else {
            this.ws.send(this.clientCodec.encode(payload));
        }
    }

    matchesStoreKey(storeKey: string | undefined) {
        return Boolean(storeKey) && this.#settingsProtoStoreKey === storeKey;
    }

    sendLocalDispatch(payload: { t: string; d: any }) {
        this.#lastSequence += 1;
        this.#sendToClient({
            op: 0,
            t: payload.t,
            d: payload.d,
            s: this.#lastSequence
        });
    }

    #onFluxerOpen() {
        console.log("[GatewayProxy] Fluxer connected");
        this.#fluxerReady = true;
        this.#messageEvent.notify();
    }

    #onClientClose(code: number, reason: Buffer) {
        this.#queue.push({ type: "clientClose", code, reason: reason.toString() });
        this.#messageEvent.notify();
    }

    #onClientError(error: Error) {
        this.#queue.push({ type: "error", source: "client", error });
        this.#messageEvent.notify();
    }

    #onFluxerClose(code: number, reason: Buffer) {
        this.#queue.push({ type: "fluxerClose", code, reason: reason.toString() });
        this.#messageEvent.notify();
    }

    #onFluxerError(error: Error) {
        this.#queue.push({ type: "error", source: "fluxer", error });
        this.#messageEvent.notify();
    }

    #transformClientPayload(payload: any): any {
        const transformed = transformD2F(payload);
        if (transformed && transformed !== payload) {
            console.log("[GatewayProxy/C=>F]", JSON.stringify(transformed, null, 0));
        }
        return transformed;
    }

    #transformFluxerPayload(payload: any): any {
        const userId = this.#extractUserIdFromFluxerPayload(payload);
        if (userId && this.#settingsProtoStoreKey !== userId) {
            this.#settingsProtoStoreKey = userId;
        }

        const transformed = transformF2D(payload, this.#settingsProtoStoreKey);
        if (transformed !== payload) {
            console.log("[GatewayProxy/F=>C]", JSON.stringify(transformed, null, 0));
        }
        return transformed;
    }

    #extractUserIdFromFluxerPayload(payload: any): string | undefined {
        if (payload?.op !== 0 || payload?.t !== "READY") {
            return undefined;
        }

        const userId = payload?.d?.user?.id;
        if (typeof userId === "string") {
            return userId;
        }
        if (typeof userId === "number" || typeof userId === "bigint") {
            return userId.toString();
        }

        return undefined;
    }

    async #runQueue() {
        for (;;) {
            if (this.#closed) break;

            let blocked = false;
            while (this.#queue.length > 0 && !blocked) {
                const item = this.#queue.shift()!;
                switch (item.type) {
                    case "clientMsg":
                        if (!this.#fluxerReady) {
                            this.#queue.unshift(item);
                            blocked = true;
                            break;
                        }
                        this.#sendToFluxer(this.#transformClientPayload(item.payload));
                        break;
                    case "fluxerMsg":
                        this.#sendToClient(this.#transformFluxerPayload(item.payload));
                        break;
                    case "clientClose":
                        console.log(`[GatewayProxy] Client closed (${item.code}: ${item.reason})`);
                        this.close();
                        break;
                    case "fluxerClose":
                        console.log(`[GatewayProxy] Fluxer closed (${item.code}: ${item.reason})`);
                        this.close();
                        break;
                    case "error":
                        console.error(`[GatewayProxy] Error from ${item.source}:`, item.error);
                        this.close();
                        break;
                }
            }

            await this.#messageEvent.waitFor();
        }
    }

    close() {
        if (this.#closed) return;
        this.#closed = true;
        this.#messageEvent.notify();
        this.cleanupCallback();
        this.ws.close();
        this.fluxerWs.close();
    }
}

export async function startGatewayProxy() {
    setEmojiUpdateListener((guildId, emojis) => {
        for (const client of clients) {
            client.sendLocalDispatch({
                t: "GUILD_EMOJIS_UPDATE",
                d: {
                    guild_id: guildId,
                    emojis: emojis.map(transformEmojiF2D)
                }
            });
        }
    });

    const wss = new WebSocketServer({
        port: DEFAULT_WEBSOCKET_PORT
    });

    wss.on("connection", (ws, request) => {
        const params = getQueryParams(request);

        console.log("[Gateway] Client connected");
        const gatewayProxy = new GatewayProxy(ws, params);
        gatewayProxy.cleanupCallback = () => {
            clients.delete(gatewayProxy);
        };
        clients.add(gatewayProxy);
    });

    wss.on("error", error => {
        console.error("WebSocket error:", error);
    });
}

export function dispatchSettingsProtoUpdate(
    storeKey: string | undefined,
    type: 1 | 2,
    settings: string,
    partial = false
) {
    if (!storeKey) {
        console.warn("[SettingsProto] Skipping gateway dispatch because store key is missing");
        return;
    }

    let matchedClient = false;
    console.log(`[SettingsProto] Dispatching USER_SETTINGS_PROTO_UPDATE for user ${storeKey}`);

    for (const client of clients) {
        if (!client.matchesStoreKey(storeKey)) {
            continue;
        }

        matchedClient = true;
        client.sendLocalDispatch({
            t: "USER_SETTINGS_PROTO_UPDATE",
            d: {
                settings: {
                    type,
                    value: settings
                },
                partial
            }
        });
    }

    if (!matchedClient) {
        console.warn(`[SettingsProto] No gateway client matched user ${storeKey} for local dispatch`);
    }
}

export function dispatchNotificationSettingsUpdate(storeKey: string | undefined, settings: { flags: number }) {
    if (!storeKey) {
        console.warn("[NotificationSettings] Skipping gateway dispatch because store key is missing");
        return;
    }

    let matchedClient = false;
    console.log(`[NotificationSettings] Dispatching NOTIFICATION_SETTINGS_UPDATE for user ${storeKey}`);

    for (const client of clients) {
        if (!client.matchesStoreKey(storeKey)) {
            continue;
        }

        matchedClient = true;
        client.sendLocalDispatch({
            t: "NOTIFICATION_SETTINGS_UPDATE",
            d: settings
        });
    }

    if (!matchedClient) {
        console.warn(`[NotificationSettings] No gateway client matched user ${storeKey} for local dispatch`);
    }
}
