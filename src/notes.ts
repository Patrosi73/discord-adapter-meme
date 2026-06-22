import type Koa from "koa";
import { proxyToFluxerJSON, setHeaders } from "./proxy.ts";
import {
    discordNoteNotFoundError,
    isFluxerNoteNotFound,
    translateFluxerError
} from "./fluxerErrors.ts";

function isOK(status: number) {
    return status >= 200 && status < 300;
}

async function getCurrentUserId(ctx: Koa.Context): Promise<string | undefined> {
    const { status, body } = await proxyToFluxerJSON<{ id?: string | number | bigint }>(ctx, "users/@me", {
        method: "GET",
        body: undefined
    });

    if (!isOK(status) || body?.id === undefined || body.id === null) {
        return undefined;
    }

    return `${body.id}`;
}

function applyErrorResponse(ctx: Koa.Context, status: number, headers: Headers, body: unknown) {
    setHeaders(ctx, headers);
    const translated = translateFluxerError(body, status);
    ctx.status = translated.status;
    ctx.body = translated.body;
}

export async function handleListUserNotes(ctx: Koa.Context) {
    const { status, headers, body } = await proxyToFluxerJSON(ctx, "users/@me/notes");

    if (isOK(status)) {
        ctx.status = status;
        setHeaders(ctx, headers);
        ctx.body = body ?? {};
        return;
    }

    applyErrorResponse(ctx, status, headers, body);
}

export async function handleGetUserNote(ctx: Koa.Context) {
    const noteUserId = ctx.params.userId;
    const { status, headers, body } = await proxyToFluxerJSON<{ note?: string }>(
        ctx,
        `users/@me/notes/${noteUserId}`
    );

    if (isOK(status) && body && typeof body.note === "string") {
        const currentUserId = await getCurrentUserId(ctx);
        ctx.status = 200;
        setHeaders(ctx, headers);
        ctx.body = {
            note: body.note,
            note_user_id: noteUserId,
            user_id: currentUserId ?? noteUserId
        };
        return;
    }

    if (!isOK(status) && isFluxerNoteNotFound(body)) {
        ctx.status = 404;
        setHeaders(ctx, headers);
        ctx.body = discordNoteNotFoundError();
        return;
    }

    applyErrorResponse(ctx, status, headers, body);
}

export async function handlePutUserNote(ctx: Koa.Context) {
    const noteUserId = ctx.params.userId;
    const { status, headers, body } = await proxyToFluxerJSON(ctx, `users/@me/notes/${noteUserId}`);

    if (isOK(status)) {
        ctx.status = 204;
        setHeaders(ctx, headers);
        ctx.body = null;
        return;
    }

    applyErrorResponse(ctx, status, headers, body);
}
