import Router from "@koa/router";
import Koa from "koa";
import { proxyToFluxer, proxyToFluxerJSON, setHeaders } from "./proxy.ts";
import { LOCAL_WEBSOCKET_HOST } from "./constants.ts";
import {
    transformMessageF2D,
    transformProfileF2D,
    transformConnectedAccountF2D,
    transformSessionsApiF2D,
    transformUserSettingsToProtoF2D,
    transformInviteApiF2D
} from "./gateway/transformerF2D.ts";
import { dispatchNotificationSettingsUpdate, dispatchSettingsProtoUpdate } from "./gateway.ts";
import { getNotificationSettings, setNotificationSettings } from "./notificationSettings.ts";
import {
    getDefaultSettingsProtoBase64,
    persistSettingsProtoFallback,
    mergeStoredSettingsProto,
    type SettingsProtoType
} from "./settingsProto.ts";

export const apiRouter = new Router({ prefix: "/api/v:version" });

function isOK(status: number) {
    return status >= 200 && status < 300;
}

async function readJSONBody<T>(ctx: Koa.Context): Promise<T | undefined> {
    const chunks: Buffer[] = [];

    for await (const chunk of ctx.req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (chunks.length === 0) {
        return undefined;
    }

    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

async function getFluxerUserSettings(ctx: Koa.Context) {
    return proxyToFluxerJSON(ctx, "users/@me/settings", {
        method: "GET",
        body: undefined
    });
}

async function getFluxerStoreKey(ctx: Koa.Context): Promise<string | undefined> {
    const { status, body } = await proxyToFluxerJSON<{ id?: string | number | bigint }>(ctx, "users/@me", {
        method: "GET",
        body: undefined
    });

    if (!isOK(status)) {
        return undefined;
    }

    if (!body || body.id === undefined || body.id === null) {
        return undefined;
    }

    return `${body.id}`;
}

function getBaseSettingsProto(type: SettingsProtoType, body: any): string {
    switch (type) {
        case 1:
            return transformUserSettingsToProtoF2D(body);
        case 2:
            return getDefaultSettingsProtoBase64(type);
    }
}

async function handleSettingsProtoGet(ctx: Koa.Context, type: SettingsProtoType) {
    const { status, headers, body } = await getFluxerUserSettings(ctx);
    ctx.status = status;
    setHeaders(ctx, headers);

    if (isOK(status) && body) {
        const storeKey = await getFluxerStoreKey(ctx);
        const baseSettings = getBaseSettingsProto(type, body);
        ctx.body = {
            settings: mergeStoredSettingsProto(type, storeKey, baseSettings)
        };
    } else {
        ctx.body = body;
    }
}

async function handleSettingsProtoPatch(ctx: Koa.Context, type: SettingsProtoType) {
    const requestBody = await readJSONBody<{ settings?: string }>(ctx);
    if (typeof requestBody?.settings !== "string") {
        ctx.status = 400;
        ctx.body = {
            message: "Missing settings-proto payload"
        };
        return;
    }

    const { status, headers, body } = await getFluxerUserSettings(ctx);
    ctx.status = status;
    setHeaders(ctx, headers);

    if (isOK(status) && body) {
        const storeKey = await getFluxerStoreKey(ctx);
        const baseSettings = getBaseSettingsProto(type, body);
        const mergedSettings = persistSettingsProtoFallback(type, storeKey, baseSettings, requestBody.settings);
        dispatchSettingsProtoUpdate(storeKey, type, mergedSettings, false);
        ctx.body = {
            settings: mergedSettings
        };
    } else {
        ctx.body = body;
    }
}

async function handleNotificationSettingsGet(ctx: Koa.Context) {
    const storeKey = await getFluxerStoreKey(ctx);
    ctx.body = getNotificationSettings(storeKey);
}

async function handleNotificationSettingsPatch(ctx: Koa.Context) {
    const requestBody = await readJSONBody<{ flags?: number }>(ctx);
    if (typeof requestBody?.flags !== "number") {
        ctx.status = 400;
        ctx.body = {
            message: "Missing notification settings flags"
        };
        return;
    }

    const storeKey = await getFluxerStoreKey(ctx);
    const notificationSettings = setNotificationSettings(storeKey, {
        flags: requestBody.flags
    });

    dispatchNotificationSettingsUpdate(storeKey, notificationSettings);
    ctx.body = notificationSettings;
}

apiRouter.get("/gateway", ctx => {
    ctx.body = { url: `ws://${LOCAL_WEBSOCKET_HOST}` };
});

const trackingHandler = (ctx: Koa.Context) => {
    ctx.status = 204;
};
apiRouter.all("/science", trackingHandler);
apiRouter.all("/track", trackingHandler);

apiRouter.post("/metrics/v2", async ctx => {
    ctx.status = 204;
});

apiRouter.get("/guilds/:guildId/integrations", ctx => {
    ctx.body = [];
});

function makeSimpleBodyTransformer(transformer: (body: any) => any, overrideFetchOptions?: Partial<RequestInit>) {
    return async (ctx: Koa.Context) => {
        const { status, headers, body } = await proxyToFluxerJSON(ctx, undefined, overrideFetchOptions);
        ctx.status = status;
        setHeaders(ctx, headers);

        if (isOK(status) && body) {
            ctx.body = transformer(body);
        } else {
            ctx.body = body;
        }
    };
}

apiRouter.get(
    "/channels/:channelId/messages",
    makeSimpleBodyTransformer(body => body.map(transformMessageF2D))
);

apiRouter.post("/channels/:channelId/messages/:messageId/ack", async ctx => {
    const { status, headers, body } = await proxyToFluxerJSON(ctx);
    ctx.status = status;
    setHeaders(ctx, headers);
    if (body) {
        ctx.set("Content-Type", "application/json");
        ctx.body = { token: null };
        ctx.status = 200;
    }
});

apiRouter.get("/users/:userId/profile", makeSimpleBodyTransformer(transformProfileF2D));
apiRouter.get(
    "/users/@me/connections",
    makeSimpleBodyTransformer(body => {
        if (Array.isArray(body)) {
            return body.map(transformConnectedAccountF2D);
        }
        if (body && Array.isArray(body.connected_accounts)) {
            return {
                ...body,
                connected_accounts: body.connected_accounts.map(transformConnectedAccountF2D)
            };
        }
        return body;
    })
);

apiRouter.get("/users/@me/settings-proto/1", async ctx => {
    await handleSettingsProtoGet(ctx, 1);
});

apiRouter.get("/users/@me/settings-proto/2", async ctx => {
    await handleSettingsProtoGet(ctx, 2);
});

apiRouter.patch("/users/@me/settings-proto/1", async ctx => {
    await handleSettingsProtoPatch(ctx, 1);
});

apiRouter.patch("/users/@me/settings-proto/2", async ctx => {
    await handleSettingsProtoPatch(ctx, 2);
});

apiRouter.get("/users/@me/notification-settings", async ctx => {
    await handleNotificationSettingsGet(ctx);
});

apiRouter.patch("/users/@me/notification-settings", async ctx => {
    await handleNotificationSettingsPatch(ctx);
});

apiRouter.get("/users/@me/affinities/users", async ctx => {
    ctx.body = {
        user_affinities: []
    };
});

apiRouter.get("/users/@me/affinities/v2/users", async ctx => {
    ctx.body = {
        user_affinities: []
    };
});

apiRouter.get("/users/@me/affinities/guilds", async ctx => {
    ctx.body = {
        guild_affinities: []
    };
});

apiRouter.get("/users/@me/affinities/channels", async ctx => {
    ctx.body = {
        channel_affinities: []
    };
});

apiRouter.get("/auth/sessions", makeSimpleBodyTransformer(transformSessionsApiF2D));

apiRouter.put(
    "/users/@me/relationships/:userId",
    makeSimpleBodyTransformer(body => body, {
        method: "POST"
    })
);

apiRouter.get("/discoverable-guilds", async ctx => {
    const { status, headers, body } = await proxyToFluxerJSON(ctx, "discovery/guilds?" + ctx.querystring, {
        method: "GET",
        body: undefined
    });
    ctx.status = status;
    setHeaders(ctx, headers);
    if (body) {
        ctx.body = body;
    }
});

apiRouter.get("/discovery/categories", async ctx => {
    const { status, headers, body } = await proxyToFluxerJSON(ctx, "discovery/categories", {
        method: "GET",
        body: undefined
    });
    ctx.status = status;
    setHeaders(ctx, headers);
    if (body) {
        ctx.body = body.map((cat: any) => ({ ...cat, is_primary: true }));
    } else {
        ctx.body = body;
    }
});

apiRouter.get("/invites/:code", makeSimpleBodyTransformer(transformInviteApiF2D));

apiRouter.post("/users/@me/channels", async ctx => {
    const requestBody = await readJSONBody<Record<string, any> & { recipients?: string[] }>(ctx);
    let remappedBody = requestBody;

    if (requestBody && Array.isArray(requestBody.recipients) && requestBody.recipients.length === 1) {
        const [recipientId] = requestBody.recipients;
        const { recipients: _recipients, ...rest } = requestBody;
        remappedBody = {
            ...rest,
            recipient_id: recipientId
        };
    }

    const overrideFetchOptions: Partial<RequestInit> = remappedBody
        ? {
              method: "POST",
              body: JSON.stringify(remappedBody),
              headers: {
                  "Content-Type": "application/json"
              }
          }
        : { method: "POST" };

    const { status, headers, body } = await proxyToFluxerJSON(ctx, undefined, overrideFetchOptions);
    ctx.status = status;
    setHeaders(ctx, headers);
    ctx.body = body;
});

apiRouter.all("{/*path}", async ctx => {
    const subPath = ctx.params.path || "";
    await proxyToFluxer(ctx, subPath);
});
