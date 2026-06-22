export interface DiscordApiError {
    message: string;
    code: number;
    retry_after?: number;
    global?: boolean;
}

const FLUXER_TO_DISCORD_ERROR: Record<string, DiscordApiError> = {
    UNKNOWN_ACCOUNT: { code: 10001, message: "Unknown Account" },
    UNKNOWN_APPLICATION: { code: 10002, message: "Unknown Application" },
    UNKNOWN_CHANNEL: { code: 10003, message: "Unknown Channel" },
    UNKNOWN_GUILD: { code: 10004, message: "Unknown Guild" },
    UNKNOWN_INTEGRATION: { code: 10005, message: "Unknown Integration" },
    UNKNOWN_INVITE: { code: 10006, message: "Unknown Invite" },
    UNKNOWN_MEMBER: { code: 10007, message: "Unknown Member" },
    UNKNOWN_MESSAGE: { code: 10008, message: "Unknown Message" },
    UNKNOWN_OVERWRITE: { code: 10009, message: "Unknown Overwrite" },
    UNKNOWN_PROVIDER: { code: 10010, message: "Unknown Provider" },
    UNKNOWN_ROLE: { code: 10011, message: "Unknown Role" },
    UNKNOWN_TOKEN: { code: 10012, message: "Unknown Token" },
    UNKNOWN_USER: { code: 10013, message: "Unknown User" },
    UNKNOWN_EMOJI: { code: 10014, message: "Unknown Emoji" },
    UNKNOWN_WEBHOOK: { code: 10015, message: "Unknown Webhook" },
    UNKNOWN_STICKER: { code: 10029, message: "Unknown Sticker" }
};

export function discordNoteNotFoundError(): DiscordApiError {
    return {
        message: "Unknown User",
        code: 10013
    };
}

export function isFluxerNoteNotFound(body: unknown): boolean {
    if (!body || typeof body !== "object") {
        return false;
    }

    const error = body as { code?: string | number };
    return error.code === "UNKNOWN_USER" || error.code === 10013;
}

export function translateFluxerError(
    body: unknown,
    status: number
): { status: number; body: unknown } {
    if (!body || typeof body !== "object") {
        return { status, body };
    }

    const error = body as {
        code?: string | number;
        message?: string;
        retry_after?: number;
        global?: boolean;
    };

    if (typeof error.code === "number") {
        return { status, body };
    }

    if (error.code === "RATE_LIMITED") {
        return {
            status: 429,
            body: {
                message: error.message ?? "You are being rate limited.",
                retry_after: error.retry_after ?? 1,
                global: error.global ?? false
            }
        };
    }

    const mapping = typeof error.code === "string" ? FLUXER_TO_DISCORD_ERROR[error.code] : undefined;
    if (!mapping) {
        return { status, body };
    }

    const discordBody: DiscordApiError = {
        message: mapping.message,
        code: mapping.code
    };

    if (error.retry_after !== undefined) {
        discordBody.retry_after = error.retry_after;
    }
    if (error.global !== undefined) {
        discordBody.global = error.global;
    }

    return { status, body: discordBody };
}
