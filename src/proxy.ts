import Koa from "koa";
import { Readable } from "node:stream";

const FLUXER_API_BASE = "https://web.fluxer.app/api/v1";

const SKIP_HEADERS = [
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "origin",
];

function buildFetchOptions(
  ctx: Koa.Context,
  override: Partial<RequestInit> = {},
): RequestInit & { duplex?: string } {
  const overrideHeaders = "headers" in override ? override.headers : {};
  const hasOverrideBody = "body" in override;

  const options: RequestInit & { duplex?: string } = {
    method: ctx.method,
    ...override,
    headers: {
      "Content-Type": ctx.get("Content-Type"),
      Authorization: ctx.get("Authorization"),
      "User-Agent": ctx.get("User-Agent"),
      ...overrideHeaders,
    },
  };

  if (!["GET", "HEAD"].includes(options.method ?? "") && !hasOverrideBody) {
    options.body = ctx.req as any;
    options.duplex = "half";
  }

  return options;
}

function withFluxerOrigin(
  overrideFetchOptions: Partial<RequestInit> = {},
): Partial<RequestInit> {
  return {
    ...overrideFetchOptions,
    headers: {
      Origin: "https://web.fluxer.app",
      ...("headers" in overrideFetchOptions
        ? overrideFetchOptions.headers
        : {}),
    },
  };
}

/**
 * Proxy a request to any upstream URL, streaming the response as-is.
 */
export async function proxyToUrl(
  ctx: Koa.Context,
  targetUrl: string,
  overrideFetchOptions: Partial<RequestInit> = {},
) {
  console.log(`[Proxy] ${ctx.method} ${ctx.path} -> ${targetUrl}`);

  try {
    const res = await fetch(
      targetUrl,
      buildFetchOptions(ctx, overrideFetchOptions),
    );

    ctx.status = res.status;
    setHeaders(ctx, res.headers);

    if (res.body) {
      const readable = Readable.fromWeb(res.body as any);
      readable.on("error", (err: any) => {
        if (err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
          console.error("Stream error:", err);
        }
      });
      ctx.body = readable;
    } else {
      ctx.body = null;
    }
  } catch (err) {
    console.error(`Proxy error for ${targetUrl}:`, err);
    ctx.status = 502;
    ctx.body = { error: "Bad Gateway", message: "Failed to reach upstream" };
  }
}

/**
 * Proxy a request to Fluxer, streaming the response as-is.
 */
export async function proxyToFluxer(ctx: Koa.Context, subPath: string) {
  const targetUrl = `${FLUXER_API_BASE}/${subPath}${ctx.search}`;
  await proxyToUrl(ctx, targetUrl, withFluxerOrigin());
}

function stripAPIVersion(url: string) {
  return url.replace(/^\/api\/v\d+/, "");
}

export function buildFluxerPathWithQuery(
  ctx: Koa.Context,
  queryOverrides: Record<string, string>,
): string {
  const url = new URL(stripAPIVersion(ctx.url), "http://localhost");

  for (const [key, value] of Object.entries(queryOverrides)) {
    url.searchParams.set(key, value);
  }

  return `${url.pathname}${url.search}`;
}

/**
 * Proxy a request to Fluxer, returning the parsed JSON body for interception/rewriting.
 * The caller is responsible for setting ctx.status, ctx.set(), and ctx.body.
 */
export async function proxyToFluxerJSON<T = any>(
  ctx: Koa.Context,
  overrideUrl: string | undefined = undefined,
  overrideFetchOptions: Partial<RequestInit> = {},
): Promise<{ status: number; headers: Headers; body: T }> {
  const targetUrl = `${FLUXER_API_BASE}/${stripAPIVersion(overrideUrl ?? ctx.url)}`;

  console.log(`[Proxy] ${ctx.method} ${ctx.path} -> ${targetUrl} (JSON)`);

  const res = await fetch(
    targetUrl,
    buildFetchOptions(ctx, withFluxerOrigin(overrideFetchOptions)),
  );

  let body = undefined;
  if (res.headers.get("Content-Type")?.includes("application/json")) {
    body = await res.json();
  }

  return {
    status: res.status,
    headers: res.headers,
    body: body as T,
  };
}

export function setHeaders(ctx: Koa.Context, headers: Headers) {
  for (const [key, value] of headers.entries()) {
    if (!SKIP_HEADERS.includes(key.toLowerCase())) {
      ctx.set(key, value);
    }
  }
}
