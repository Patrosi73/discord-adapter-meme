import Router from "@koa/router";
import Koa from "koa";
import { proxyToUrl } from "./proxy.ts";

const FLUXER_CDN_BASE = "https://fluxerusercontent.com";
const FLUXER_STATIC_BASE = "https://fluxerstatic.com";

type CdnRoute = {
    path: string;
    upstreamBaseUrl?: string;
    buildUpstreamPath?: (ctx: Koa.Context) => string;
};

const passthroughPath = (ctx: Koa.Context) => ctx.path;
const remapDiscoverySplashPath = (ctx: Koa.Context) =>
    ctx.path.replace(/^\/discovery-splashes\//, "/embed-splashes/").replace(/\.[^/.]+$/, ".webp");

const CDN_ROUTES: CdnRoute[] = [
    { path: "/attachments-quick-links/*assetPath" },
    { path: "/app-assets/:applicationId/achievements/:achievementId/icons/:iconAsset" },
    { path: "/app-assets/:applicationId/store/:assetId" },
    { path: "/app-assets/:applicationId/:assetId" },
    { path: "/app-icons/:applicationId/:assetId" },
    { path: "/application-directory/collection-items/:itemId/:itemHash" },
    { path: "/attachments/:channelId/:messageId/:attachmentId/:attachmentFilename" },
    { path: "/ephemeral-attachments/:applicationId/:attachmentId/:attachmentFilename" },
    { path: "/avatar-decoration-presets/:avatarDecorationAsset" },
    { path: "/channels/:channelId/icons/:channelIcon" },
    { path: "/clan-badges/:guildId/:badgeHash" },
    { path: "/clan-banners/:guildId/:bannerHash" },
    { path: "/emojis/:emojiId" },
    { path: "/icons/:guildId/:guildIcon" },
    { path: "/splashes/:guildId/:guildSplash" },
    {
        path: "/discovery-splashes/:guildId/:guildDiscoverySplash",
        buildUpstreamPath: remapDiscoverySplashPath
    },
    { path: "/banners/:entityId/:bannerHash" },
    { path: "/home-headers/:guildId/:guildHomeHeader" },
    { path: "/guild-events/:scheduledEventId/:coverImage" },
    { path: "/guilds/:guildId/users/:userId/avatars/:userAvatar" },
    { path: "/guilds/:guildId/users/:userId/banners/:userBanner" },
    { path: "/new-member-actions/:channelId/:actionIcon" },
    { path: "/resource-channels/:channelId/:channelIcon" },
    { path: "/guild-tag-badges/:guildId/:badgeHash" },
    { path: "/assets/collectibles/*assetPath" },
    { path: "/badges/*assetPath", upstreamBaseUrl: FLUXER_STATIC_BASE },
    { path: "/badge-icons/:badgeIcon" },
    { path: "/assets/quests/:questId/*assetPath" },
    { path: "/roles/:roleId/icons/:roleIcon" },
    { path: "/soundboard-sounds/:soundId" },
    { path: "/stickers/:stickerId" },
    { path: "/streams/:streamKey/:thumbnailHash" },
    { path: "/team-icons/:teamId/:teamIcon" },
    { path: "/avatars/:userId/archived/:avatarId/:avatarStorageHash" },
    { path: "/avatars/:userId/:userAvatar" },
    { path: "/embed/avatars/:userIndex" },
    { path: "/users/:userId/video-filter-assets/:videoFilterId/:videoFilterAsset" }
];

export const LOCAL_CDN_ASSET_PREFIXES = ["/assets/collectibles/", "/assets/quests/"];

export function isLocalCdnAssetPath(path: string) {
    return LOCAL_CDN_ASSET_PREFIXES.some(prefix => path.startsWith(prefix));
}

export const cdnRouter = new Router();

async function proxyToFluxerCdn(ctx: Koa.Context, route: CdnRoute) {
    // Most Fluxer CDN paths are direct passthroughs. Route-specific steering can
    // be added here later by overriding buildUpstreamPath/upstreamBaseUrl.
    const targetPath = route.buildUpstreamPath?.(ctx) ?? passthroughPath(ctx);
    const targetUrl = `${route.upstreamBaseUrl ?? FLUXER_CDN_BASE}${targetPath}${ctx.search}`;
    await proxyToUrl(ctx, targetUrl);
}

for (const route of CDN_ROUTES) {
    cdnRouter.all(route.path, async ctx => {
        await proxyToFluxerCdn(ctx, route);
    });
}
