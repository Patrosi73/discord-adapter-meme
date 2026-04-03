import * as cheerio from "cheerio";
import { Eta } from "eta";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { LOCAL_HOST, LOCAL_WEBSOCKET_HOST } from "./constants.ts";

export const BASE_URL = "https://discord.com";

export class ClientLoader {
    private static cachedHtml: string | null = null;

    static async init() {
        const stuffDirCandidates = [process.env.ADAPTER_STUFF_DIR, path.join(process.cwd(), "stuff")].filter(
            (candidate): candidate is string => Boolean(candidate)
        );

        const filePath =
            stuffDirCandidates.map(dir => path.join(dir, "index.html")).find(candidate => existsSync(candidate)) ||
            path.join(process.cwd(), "stuff", "index.html");

        let rawHtml: string;

        try {
            console.log("[ClientLoader] Fetching Discord app HTML...");
            const res = await fetch(`${BASE_URL}/app`, {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            });

            if (!res.ok) {
                throw new Error(`Failed to fetch Discord app HTML (${res.status} ${res.statusText})`);
            }

            rawHtml = await res.text();
        } catch (error) {
            console.warn("[ClientLoader] Failed to fetch Discord app HTML, using local fallback...", error);
            rawHtml = await fs.readFile(filePath, "utf-8");
        }

        const $ = cheerio.load(rawHtml);

        // Extract scripts and links to inject
        const preloads = $('link[rel="preload"]')
            .map((_, el) => $.html(el))
            .get()
            .join("\n    ");
        const styles = $('link[rel="stylesheet"]')
            .map((_, el) => $.html(el))
            .get()
            .join("\n    ");
        const scripts = $("script[defer]")
            .map((_, el) => $.html(el))
            .get()
            .join("\n    ");
        const favicons = $('link[rel="icon"]')
            .map((_, el) => $.html(el))
            .get()
            .join("\n    ");

        const fastConnectInline =
            $("script")
                .filter((_, el) => {
                    const content = $(el).text();
          return (
            content.includes("window.WebSocket") &&
            content.includes("FAST CONNECT")
          );
                })
                .first()
                .html() || "";

        const eta = new Eta();

        const template = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta content="width=device-width, initial-scale=1.0, maximum-scale=3.0" name="viewport">

    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Discord">
    <meta property="og:title" content="Discord - Group Chat That’s All Fun &amp; Games">
    <meta property="og:description" content="Discord is great for playing games and chilling with friends, or even building a worldwide community. Customize your own space to talk, play, and hang out.">
    <meta property="og:image" content="https://cdn.discordapp.com/assets/og_img_discord_home.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@discord">
    <meta name="twitter:creator" content="@discord">

    <title>Discord (Adapter)</title>

    <script>
        window.GLOBAL_ENV = <%~ it.GLOBAL_ENV %>;
    </script>
    <script>
        window.__OVERLAY__ = /overlay/.test(location.pathname);
        window.__BILLING_STANDALONE__ = /^\\/billing/.test(location.pathname);
    </script>

    <%~ it.preloads %>
    <%~ it.favicons %>

    <script>
        <%~ it.fastConnectInline %>
    </script>

    <%~ it.scripts %>
    <%~ it.styles %>
</head>
<body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="app-mount"></div>
</body>
</html>
        `.trim();

        const defaultEnv = {
            NODE_ENV: "production",
            BUILT_AT: "1772180331325",
            HTML_TIMESTAMP: Date.now(),
            BUILD_NUMBER: "503231",
            PROJECT_ENV: "production",
            RELEASE_CHANNEL: "stable",
            VERSION_HASH: "dev",
            PRIMARY_DOMAIN: "fluxer.app",
            PUBLIC_PATH: "/assets/",
            LOCATION: "history",
            API_VERSION: 9,
            API_PROTOCOL: "http:",
            API_ENDPOINT: `//${LOCAL_HOST}/api`,
            GATEWAY_ENDPOINT: `ws://${LOCAL_WEBSOCKET_HOST}`,
            STATIC_ENDPOINT: "",
            ASSET_ENDPOINT: `//${LOCAL_HOST}`,
            MEDIA_PROXY_ENDPOINT: "//media.discordapp.net",
            IMAGE_PROXY_ENDPOINTS: "//images-ext-1.discordapp.net,//images-ext-2.discordapp.net",
            CDN_HOST: `//${LOCAL_HOST}`,
            DEVELOPERS_ENDPOINT: `//${LOCAL_HOST}`,
            MARKETING_ENDPOINT: `//${LOCAL_HOST}`,
            WEBAPP_ENDPOINT: `//${LOCAL_HOST}`,
            WIDGET_ENDPOINT: `//${LOCAL_HOST}/widget`,
            ADS_MANAGER_ENDPOINT: "//ads.discord.com",
            NETWORKING_ENDPOINT: "//router.discordapp.net",
            //   REMOTE_AUTH_ENDPOINT: "wss://remote-auth-gateway.discord.gg",
            RTC_LATENCY_ENDPOINT: `//${LOCAL_HOST}/api/_adapter/rtc-latency`,
            INVITE_HOST: "fluxer.gg",
            GUILD_TEMPLATE_HOST: "fluxer.new",
            GIFT_CODE_HOST: "fluxer.gift",
            ACTIVITY_APPLICATION_HOST: "discordsays.com",
            //   MIGRATION_SOURCE_ORIGIN: "https://discordapp.com",
            //   MIGRATION_DESTINATION_ORIGIN: "https://discord.com",
            //   STRIPE_KEY: "pk_live_CUQtlpQUF0vufWpnpUmQvcdi",
            //   ADYEN_KEY: "live_E3OQ33V6GVGTXOVQZEAFQJ6DJIDVG6SY",
            //   BRAINTREE_KEY: "production_ktzp8hfp_49pp2rp4phym7387",
            WEBAUTHN_ORIGIN: "fluxer.app"
        };

        this.cachedHtml = eta.renderString(template, {
            GLOBAL_ENV: JSON.stringify(defaultEnv),
            preloads,
            favicons,
            fastConnectInline,
            scripts,
            styles
        });
    }

    static getHtml(): string {
        if (!this.cachedHtml) {
            throw new Error("ClientLoader not initialized. Call init() first.");
        }
        return this.cachedHtml;
    }
}
