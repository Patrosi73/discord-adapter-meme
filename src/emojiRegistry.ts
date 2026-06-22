export interface DiscoveredEmoji {
    name: string;
    id: string;
    animated: boolean;
    available: boolean;
    managed: boolean;
    require_colons: boolean;
    roles: string[];
    guildId?: string;
}

const CUSTOM_EMOJI_RE = /<a?:([^:]+):(\d+)>/g;

const knownGuildIds = new Set<string>();
const guildEmojiLists = new Map<string, DiscoveredEmoji[]>();
const discoveredEmojis = new Map<string, DiscoveredEmoji>();
const channelToGuildId = new Map<string, string>();

type EmojiUpdateListener = (guildId: string, emojis: DiscoveredEmoji[]) => void;
let emojiUpdateListener: EmojiUpdateListener | null = null;

export function setEmojiUpdateListener(listener: EmojiUpdateListener | null) {
    emojiUpdateListener = listener;
}

function createDiscoveredEmoji(
    name: string,
    id: string,
    animated: boolean,
    guildId?: string
): DiscoveredEmoji {
    return {
        name,
        id,
        animated,
        available: true,
        managed: false,
        require_colons: true,
        roles: [],
        guildId
    };
}

function upsertDiscoveredEmoji(emoji: DiscoveredEmoji): boolean {
    const existing = discoveredEmojis.get(emoji.id);
    if (existing) {
        if (!existing.guildId && emoji.guildId) {
            discoveredEmojis.set(emoji.id, { ...existing, guildId: emoji.guildId });
            return true;
        }
        return false;
    }

    discoveredEmojis.set(emoji.id, emoji);
    return true;
}

function dedupeEmojis(emojis: DiscoveredEmoji[]): DiscoveredEmoji[] {
    const byId = new Map<string, DiscoveredEmoji>();

    for (const emoji of emojis) {
        const key = emoji.id ?? emoji.name;
        byId.set(key, emoji);
    }

    return Array.from(byId.values());
}

export function registerKnownGuild(guildId: string) {
    knownGuildIds.add(guildId);
}

export function registerGuildChannel(channel: { id: string; guild_id?: string | null } | null | undefined) {
    if (channel?.id && channel.guild_id != null) {
        channelToGuildId.set(String(channel.id), String(channel.guild_id));
        registerKnownGuild(String(channel.guild_id));
    }
}

export function registerGuildChannels(guildId: string, channels: Array<{ id: string }> | null | undefined) {
    registerKnownGuild(guildId);

    for (const channel of channels ?? []) {
        if (channel?.id) {
            channelToGuildId.set(channel.id, guildId);
        }
    }
}

export function resolveMessageGuildId(message: any): string | undefined {
    const directGuildId = message?.guild_id;
    if (directGuildId != null) {
        return String(directGuildId);
    }

    const channelGuildId = message?.channel?.guild_id;
    if (channelGuildId != null) {
        return String(channelGuildId);
    }

    const channelId = message?.channel_id;
    if (channelId != null) {
        return channelToGuildId.get(String(channelId));
    }

    return undefined;
}

export function setGuildEmojis(guildId: string, emojis: DiscoveredEmoji[]) {
    registerKnownGuild(guildId);
    guildEmojiLists.set(guildId, dedupeEmojis(emojis));
}

export function mergeDiscoveredEmojis(guildId: string, emojis: DiscoveredEmoji[]): DiscoveredEmoji[] {
    setGuildEmojis(guildId, emojis);
    return getMergedEmojisForGuild(guildId);
}

export function getMergedEmojisForGuild(guildId: string): DiscoveredEmoji[] {
    const base = guildEmojiLists.get(guildId) ?? [];
    const discovered = [...discoveredEmojis.values()].filter(emoji => emoji.guildId === guildId);
    return dedupeEmojis([...base, ...discovered]);
}

export function registerEmojisFromContent(
    content: string | null | undefined,
    guildId?: string
): boolean {
    if (!content || !guildId) {
        return false;
    }

    let added = false;

    for (const match of content.matchAll(CUSTOM_EMOJI_RE)) {
        const [raw, name, id] = match;
        if (!name || !id) {
            continue;
        }

        if (
            upsertDiscoveredEmoji(
                createDiscoveredEmoji(name, id, raw.startsWith("<a:"), guildId)
            )
        ) {
            added = true;
        }
    }

    return added;
}

export function registerEmojisFromMessage(message: any): boolean {
    const guildId = resolveMessageGuildId(message);
    let added = false;

    if (registerEmojisFromContent(message?.content, guildId)) {
        added = true;
    }

    if (message?.referenced_message) {
        const referencedMessage = {
            guild_id: guildId,
            channel_id: message.channel_id,
            ...message.referenced_message
        };
        if (registerEmojisFromMessage(referencedMessage)) {
            added = true;
        }
    }

    for (const snapshot of message?.message_snapshots ?? []) {
        const snapshotMessage = snapshot?.message ?? snapshot;
        if (registerEmojisFromContent(snapshotMessage?.content, guildId)) {
            added = true;
        }
    }

    for (const reaction of message?.reactions ?? []) {
        const emoji = reaction?.emoji;
        if (!emoji?.id || !guildId) {
            continue;
        }

        if (
            upsertDiscoveredEmoji(
                createDiscoveredEmoji(emoji.name, emoji.id, emoji.animated ?? false, guildId)
            )
        ) {
            added = true;
        }
    }

    return added;
}

export function registerEmojisFromMessages(messages: any[]): boolean {
    let added = false;

    for (const message of messages) {
        if (registerEmojisFromMessage(message)) {
            added = true;
        }
    }

    return added;
}

export function dispatchDiscoveredEmojiUpdates(guildId?: string) {
    if (!emojiUpdateListener || discoveredEmojis.size === 0 || !guildId) {
        return;
    }

    emojiUpdateListener(guildId, getMergedEmojisForGuild(guildId));
}
