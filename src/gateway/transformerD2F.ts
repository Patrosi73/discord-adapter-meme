function normalizePresenceStatusD2F(status: string | undefined | null): string {
    if (!status || status === "unknown") {
        return "online";
    }
    return status;
}

function transformOpIdentifyD2F(payload: any): any {
    const props = payload.d.properties ?? {};
    const propsOs = props.os ?? undefined;
    const propsOsVersion = props.os_version ?? undefined;
    const propsBrowser = props.browser ?? "";
    const propsBrowserVersion = props.browser_version ?? undefined;
    const propsDevice = props.device ?? undefined;
    const propsSystemLocale = props.system_locale ?? undefined;
    const propsLocale = props.locale ?? undefined;

    const presenceStatus = normalizePresenceStatusD2F(payload.d.presence?.status);
    const presenceAfk = payload.d.presence?.afk ?? true;
    const presenceMobile = payload.d.presence?.mobile ?? false;

    payload = {
        op: 2,
        d: {
            token: payload.d.token,
            properties: {
                os: propsOs,
                os_version: propsOsVersion,
                browser: `${propsBrowser} (DiscordAdapter)`,
                browser_version: propsBrowserVersion,
                device: propsDevice,
                system_locale: propsSystemLocale,
                locale: propsLocale
            },
            presence: {
                status: presenceStatus,
                afk: presenceAfk,
                mobile: presenceMobile,
                custom_status: null
            },
            flags: 2, // DEBOUNCE_MESSAGE_REACTIONS
            initial_guild_id: null
        }
    };

    return payload;
}

function transformOpSubscribeD2F(payload: any): any {
    const newSubscriptions: Record<string, any> = {};

    for (const key in payload.d.subscriptions) {
        const sub = payload.d.subscriptions[key];
        newSubscriptions[key] = {
            active: true,
            sync: true,
            member_list_channels: sub.channels ? sub.channels : undefined
        };
    }

    return {
        op: 14,
        d: {
            subscriptions: newSubscriptions
        }
    };
}

function transformOpQoSHeartbeat(payload: any): any {
    return {
        op: 1,
        d: payload.d.seq
    };
}

function transformOpPresenceUpdateD2F(payload: any): any {
    const status = payload.d?.status;
    if (!status || status === "unknown") {
        return undefined;
    }
    return payload;
}

export function transformD2F(payload: any): any {
    switch (payload.op) {
        case 2:
            return transformOpIdentifyD2F(payload);
        case 3:
            return transformOpPresenceUpdateD2F(payload);
        case 37:
            return transformOpSubscribeD2F(payload);
        case 40:
            return transformOpQoSHeartbeat(payload);
        case 13:
        case 17:
        case 18:
        case 19:
        case 20:
        case 21:
        case 22:
        case 23:
        case 24:
        case 25:
        case 26:
        case 27:
        case 28:
        case 29:
        case 30:
        case 31:
        case 32:
        case 33:
        case 34:
        case 35:
        case 36:
        case 38:
        case 39:
        case 41:
        case 42:
        case 43:
            return undefined; // ignored
        default:
            return payload;
    }
}
