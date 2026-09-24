type FluxerEndpoints = {
    api_client: string;
    gateway: string;
    media: string;
    static_cdn: string;
    webapp: string;
    marketing: string;
    invite: string;
    gift: string;
};

const DEFAULT_ENDPOINTS: FluxerEndpoints = {
    api_client: "https://web.canary.fluxer.app/api",
    gateway: "wss://gateway.fluxer.app",
    media: "https://fluxerusercontent.com",
    static_cdn: "https://fluxerstatic.com",
    webapp: "https://web.canary.fluxer.app",
    marketing: "https://canary.fluxer.app",
    invite: "https://fluxer.gg",
    gift: "https://fluxer.gift"
};

const endpoints: FluxerEndpoints = { ...DEFAULT_ENDPOINTS, ...JSON.parse(process.env.FLUXER_ENDPOINTS || "{}") };

function bareHost(url: string): string {
    return url.replace(/^[a-z]+:\/\//i, "");
}

const { api_client: apiClient } = endpoints;
const inviteHost = bareHost(endpoints.invite);

export const fluxerConfig = {
    apiBase: apiClient.endsWith("/v1") ? apiClient : `${apiClient}/v1`,
    origin: endpoints.webapp,
    gatewayUrl: `${endpoints.gateway}/?encoding=json&v=1`,
    cdnBase: endpoints.media,
    staticBase: endpoints.static_cdn,
    releaseChannel: process.env.FLUXER_RELEASE_CHANNEL === "stable" ? "stable" : "canary",
    primaryDomain: new URL(endpoints.marketing).host,
    inviteHost,
    guildTemplateHost: inviteHost === "fluxer.gg" ? "fluxer.new" : bareHost(`${endpoints.webapp}/template`),
    giftHost: bareHost(endpoints.gift),
    marketingHost: `//${bareHost(endpoints.marketing)}`
};
