import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FrecencyUserSettings, PreloadedUserSettings } from "discord-protos";

export type SettingsProtoType = 1 | 2;

type SettingsProtoCodec = {
    create(value?: any): any;
    fromBase64(base64: string): any;
    toBase64(data: any): string;
};

interface SettingsProtoVersionState {
    dataVersion: number;
}

interface SettingsProtoOverlayEntry {
    overlay?: string;
    versions?: SettingsProtoVersionState;
}

interface SettingsProtoOverlayFile {
    users: Record<string, Partial<Record<`${SettingsProtoType}`, SettingsProtoOverlayEntry | string>>>;
}

function resolveOverlayStorePath() {
    const userDataDir = process.env.VENCORD_USER_DATA_DIR?.trim();
    if (userDataDir) {
        return path.join(userDataDir, "discord-adapter-meme", "settings-proto-overlays.json");
    }

    const cwdStoreDir = path.join(process.cwd(), "discord-adapter-meme-data");
    return path.join(cwdStoreDir, "settings-proto-overlays.json");
}

const STORE_PATH = resolveOverlayStorePath();
const DEFAULT_FRECENCY_SETTINGS = FrecencyUserSettings.create({
    versions: {
        clientVersion: 20,
        serverVersion: 0,
        dataVersion: 0
    }
});

let overlayFileCache: SettingsProtoOverlayFile | undefined;

function getSettingsProtoCodec(type: SettingsProtoType): SettingsProtoCodec {
    switch (type) {
        case 1:
            return PreloadedUserSettings;
        case 2:
            return FrecencyUserSettings;
    }
}

function normalizeOverlayEntry(entry: SettingsProtoOverlayEntry | string | undefined): SettingsProtoOverlayEntry | undefined {
    if (!entry) {
        return undefined;
    }

    if (typeof entry === "string") {
        return { overlay: entry };
    }

    return entry;
}

function readOverlayFile(): SettingsProtoOverlayFile {
    if (overlayFileCache) {
        return overlayFileCache;
    }

    if (!existsSync(STORE_PATH)) {
        overlayFileCache = { users: {} };
        return overlayFileCache;
    }

    try {
        const raw = readFileSync(STORE_PATH, "utf8");
        overlayFileCache = raw ? (JSON.parse(raw) as SettingsProtoOverlayFile) : { users: {} };
    } catch (error) {
        console.warn("[SettingsProto] Failed to read overlay file, starting fresh:", error);
        overlayFileCache = { users: {} };
    }

    overlayFileCache.users ??= {};
    return overlayFileCache;
}

function writeOverlayFile(data: SettingsProtoOverlayFile) {
    mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
    overlayFileCache = data;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

function replaceTopLevelFields(baseMessage: any, patchMessage: any, codec: SettingsProtoCodec): any {
    const nextMessage = codec.create(baseMessage);

    for (const key of Object.keys(patchMessage ?? {})) {
        if (key === "versions") {
            continue;
        }

        nextMessage[key] = patchMessage[key];
    }

    return nextMessage;
}

function deepEqual(left: unknown, right: unknown): boolean {
    if (left === right) {
        return true;
    }

    if (left instanceof Uint8Array && right instanceof Uint8Array) {
        if (left.length !== right.length) {
            return false;
        }

        for (let i = 0; i < left.length; i++) {
            if (left[i] !== right[i]) {
                return false;
            }
        }

        return true;
    }

    if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) {
            return false;
        }

        for (let i = 0; i < left.length; i++) {
            if (!deepEqual(left[i], right[i])) {
                return false;
            }
        }

        return true;
    }

    if (isObject(left) && isObject(right)) {
        const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

        for (const key of keys) {
            if (!deepEqual(left[key], right[key])) {
                return false;
            }
        }

        return true;
    }

    return false;
}

function getOverlayKey(type: SettingsProtoType): `${SettingsProtoType}` {
    return `${type}` as `${SettingsProtoType}`;
}

function getStoredOverlay(type: SettingsProtoType, storeKey: string | undefined): string | undefined {
    if (!storeKey) {
        return undefined;
    }

    return normalizeOverlayEntry(readOverlayFile().users[storeKey]?.[getOverlayKey(type)])?.overlay;
}

function getStoredVersions(type: SettingsProtoType, storeKey: string | undefined): SettingsProtoVersionState | undefined {
    if (!storeKey) {
        return undefined;
    }

    return normalizeOverlayEntry(readOverlayFile().users[storeKey]?.[getOverlayKey(type)])?.versions;
}

function setStoredState(
    type: SettingsProtoType,
    storeKey: string | undefined,
    state: SettingsProtoOverlayEntry | undefined
) {
    if (!storeKey) {
        return;
    }

    const data = readOverlayFile();
    const typeKey = getOverlayKey(type);

    if (!state?.overlay && !state?.versions) {
        const userOverlays = data.users[storeKey];
        if (!userOverlays) {
            return;
        }

        delete userOverlays[typeKey];
        if (Object.keys(userOverlays).length === 0) {
            delete data.users[storeKey];
        }

        writeOverlayFile(data);
        return;
    }

    data.users[storeKey] ??= {};
    data.users[storeKey][typeKey] = state;
    writeOverlayFile(data);
}

function buildOverlayBase64(type: SettingsProtoType, baseMessage: any, targetMessage: any): string | undefined {
    const codec = getSettingsProtoCodec(type);
    const overlay: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(baseMessage ?? {}), ...Object.keys(targetMessage ?? {})]);

    for (const key of keys) {
        if (key === "versions") {
            continue;
        }

        if (!deepEqual(baseMessage?.[key], targetMessage?.[key])) {
            overlay[key] = targetMessage?.[key];
        }
    }

    if (Object.keys(overlay).length === 0) {
        return undefined;
    }

    return codec.toBase64(codec.create(overlay));
}

function getMessageVersions(message: any): { clientVersion: number; serverVersion: number; dataVersion: number } {
    return {
        clientVersion: Number(message?.versions?.clientVersion ?? 20),
        serverVersion: Number(message?.versions?.serverVersion ?? 0),
        dataVersion: Number(message?.versions?.dataVersion ?? 0)
    };
}

function applyStoredVersions(type: SettingsProtoType, message: any, storeKey: string | undefined): any {
    const versions = getStoredVersions(type, storeKey);
    if (!versions) {
        return message;
    }

    const currentVersions = getMessageVersions(message);
    return {
        ...message,
        versions: {
            clientVersion: currentVersions.clientVersion,
            serverVersion: currentVersions.serverVersion,
            dataVersion: Math.max(currentVersions.dataVersion, versions.dataVersion)
        }
    };
}

function bumpVersions(message: any): SettingsProtoVersionState {
    const versions = getMessageVersions(message);
    return {
        dataVersion: versions.dataVersion + 1
    };
}

export function getDefaultSettingsProtoBase64(type: SettingsProtoType): string {
    const codec = getSettingsProtoCodec(type);

    switch (type) {
        case 1:
            return codec.toBase64(PreloadedUserSettings.create());
        case 2:
            return codec.toBase64(DEFAULT_FRECENCY_SETTINGS);
    }
}

export function mergeStoredSettingsProto(
    type: SettingsProtoType,
    storeKey: string | undefined,
    baseSettingsBase64: string
): string {
    const overlayBase64 = getStoredOverlay(type, storeKey);
    const codec = getSettingsProtoCodec(type);

    try {
        const baseMessage = codec.fromBase64(baseSettingsBase64);
        const mergedMessage = overlayBase64
            ? replaceTopLevelFields(baseMessage, codec.fromBase64(overlayBase64), codec)
            : baseMessage;
        const versionedMessage = applyStoredVersions(type, mergedMessage, storeKey);
        return codec.toBase64(codec.create(versionedMessage));
    } catch (error) {
        console.warn(`[SettingsProto] Dropping invalid local overlay for type ${type}:`, error);
        setStoredState(type, storeKey, undefined);
        return baseSettingsBase64;
    }
}

export function persistSettingsProtoFallback(
    type: SettingsProtoType,
    storeKey: string | undefined,
    baseSettingsBase64: string,
    requestedSettingsBase64: string
): string {
    const codec = getSettingsProtoCodec(type);
    const baseMessage = codec.fromBase64(baseSettingsBase64);
    const currentEffectiveMessage = codec.fromBase64(mergeStoredSettingsProto(type, storeKey, baseSettingsBase64));
    const requestedMessage = codec.fromBase64(requestedSettingsBase64);
    const nextEffectiveMessage = replaceTopLevelFields(currentEffectiveMessage, requestedMessage, codec);
    const nextVersions = bumpVersions(nextEffectiveMessage);
    const overlayBase64 = buildOverlayBase64(type, baseMessage, nextEffectiveMessage);
    const nextResponseMessage = codec.create({
        ...nextEffectiveMessage,
        versions: {
            ...getMessageVersions(nextEffectiveMessage),
            ...nextVersions
        }
    });

    setStoredState(type, storeKey, {
        overlay: overlayBase64,
        versions: nextVersions
    });

    if (overlayBase64) {
        console.log(`[SettingsProto] Saved local fallback for type ${type}`);
    }

    return codec.toBase64(nextResponseMessage);
}
