import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface DiscordNotificationSettings {
    flags: number;
}

interface NotificationSettingsFile {
    users: Record<string, DiscordNotificationSettings>;
}

const DEFAULT_NOTIFICATION_SETTINGS: DiscordNotificationSettings = {
    flags: 1 << 4
};

function resolveNotificationSettingsStorePath() {
    const userDataDir = process.env.VENCORD_USER_DATA_DIR?.trim();
    if (userDataDir) {
        return path.join(userDataDir, "discord-adapter-meme", "notification-settings.json");
    }

    return path.join(process.cwd(), "discord-adapter-meme-data", "notification-settings.json");
}

const STORE_PATH = resolveNotificationSettingsStorePath();

let storeCache: NotificationSettingsFile | undefined;

function readStore(): NotificationSettingsFile {
    if (storeCache) {
        return storeCache;
    }

    if (!existsSync(STORE_PATH)) {
        storeCache = { users: {} };
        return storeCache;
    }

    try {
        const raw = readFileSync(STORE_PATH, "utf8");
        storeCache = raw ? (JSON.parse(raw) as NotificationSettingsFile) : { users: {} };
    } catch (error) {
        console.warn("[NotificationSettings] Failed to read store, starting fresh:", error);
        storeCache = { users: {} };
    }

    storeCache.users ??= {};
    return storeCache;
}

function writeStore(data: NotificationSettingsFile) {
    mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
    storeCache = data;
}

export function getNotificationSettings(storeKey: string | undefined): DiscordNotificationSettings {
    if (!storeKey) {
        return { ...DEFAULT_NOTIFICATION_SETTINGS };
    }

    return {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        ...(readStore().users[storeKey] ?? {})
    };
}

export function setNotificationSettings(
    storeKey: string | undefined,
    settings: Partial<DiscordNotificationSettings>
): DiscordNotificationSettings {
    const nextSettings = {
        ...getNotificationSettings(storeKey),
        ...settings
    };

    if (!storeKey) {
        return nextSettings;
    }

    const data = readStore();
    data.users[storeKey] = nextSettings;
    writeStore(data);

    console.log(`[NotificationSettings] Saved local notification settings for ${storeKey.slice(0, 8)}`);
    return nextSettings;
}
