import Koa from "koa";
import https from "node:https";
import { router } from "./router.ts";
import { ClientLoader, BASE_URL } from "./client-loader.ts";
import { isLocalCdnAssetPath } from "./cdn.ts";
import { DEFAULT_PORT } from "./constants.ts";
import { getOrCreateCerts } from "./cert.ts";
import { startGatewayProxy } from "./gateway.ts";

const start = async () => {
    console.log("Initializing ClientLoader...");
    await ClientLoader.init();

    console.log("Loading SSL certificates...");
    const { key, cert } = await getOrCreateCerts();

    const app = new Koa();

    app.use(async (ctx, next) => {
        if (ctx.path.startsWith("/assets/") && !isLocalCdnAssetPath(ctx.path)) {
            const url = `${BASE_URL}${ctx.path}${ctx.search}`;
            try {
                const headers = {};

                const res = await fetch(url, {
                    headers: {
                        "User-Agent":
                            ctx.get("User-Agent") ||
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        ...(ctx.req.headers as Record<string, string>),
                        host: "discord.com",
                        referer: "https://discord.com/app"
                    }
                });

                ctx.status = res.status;
                for (const [key, value] of res.headers.entries()) {
                    const lowerKey = key.toLowerCase();
                    if (["content-encoding", "transfer-encoding", "connection", "keep-alive"].includes(lowerKey)) {
                        continue;
                    }
                    ctx.set(key, value);
                }

                // @ts-ignore
                ctx.body = res.body;
                return;
            } catch (err) {
                console.error(`Proxy error for ${url}:`, err);
                ctx.status = 502;
                ctx.body = "Bad Gateway";
                return;
            }
        }
        await next();
    });

    app.use(router.routes()).use(router.allowedMethods());

    app.use(async ctx => {
        if (ctx.status !== 200 && ctx.status !== 301 && ctx.status !== 302 && ctx.status !== 204) {
            console.log(`[404 Fallback] Path: ${ctx.path}`);
            ctx.status = 404;
            ctx.type = "html";
            ctx.body = `
              <!DOCTYPE html>
              <html>
              <head><title>404 Not Found</title></head>
              <body style="font-family: sans-serif; padding: 2rem; line-height: 1.6;">
                  <h1>404 Not Found</h1>
                  <p>The path <code>${ctx.path}</code> is not handled by this adapter.</p>
                  <hr>
                  <small>Fluxer Discord Adapter</small>
              </body>
              </html>
          `;
        }
    });

    app.on("error", err => {
        if (err?.code === "ERR_STREAM_PREMATURE_CLOSE") return;
        if (err?.code === "EPIPE") return;
        console.error("[Koa] Server error:", err);
    });

    const PORT = process.env.PORT || DEFAULT_PORT;
    https.createServer({ key, cert }, app.callback()).listen(PORT, () => {
        console.log(`Adapter server running at https://localhost:${PORT}`);
    });

    await startGatewayProxy();
};

start().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
});

process.on("unhandledRejection", reason => {
    console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", err => {
    console.error("Uncaught exception:", err);
    process.exit(1);
});
