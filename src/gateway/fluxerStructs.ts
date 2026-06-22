// Taken partially from https://github.com/fluxerapp/fluxer/
export interface FluxerSession {
  afk: boolean;
  mobile: boolean;
  session_id: string;
  status: string;
}

export interface FluxerGuild {
  id: string;
  name: string;
  icon: string | null;
  banner?: string | null;
  banner_width?: number | null;
  banner_height?: number | null;
  splash?: string | null;
  splash_width?: number | null;
  splash_height?: number | null;
  splash_card_alignment?: number;
  embed_splash?: string | null;
  embed_splash_width?: number | null;
  embed_splash_height?: number | null;
  vanity_url_code: string | null;
  owner_id: string;
  system_channel_id: string | null;
  system_channel_flags?: number;
  rules_channel_id?: string | null;
  afk_channel_id?: string | null;
  afk_timeout?: number;
  features: ReadonlyArray<string>;
  verification_level?: number;
  mfa_level?: number;
  nsfw_level?: number;
  explicit_content_filter?: number;
  default_message_notifications?: number;
  disabled_operations?: number;
  message_history_cutoff?: string | null;
  joined_at?: string;
  unavailable?: boolean;
  member_count?: number;
  channels: FluxerChannel[];
  emojis?: any[];
  stickers?: any[];
  members?: FluxerGuildMemberData[];
}

export interface FluxerChannelOverride {
  collapsed: boolean;
  message_notifications: number;
  muted: boolean;
  mute_config: any | null;
}

type FluxerChannel = any;
type FluxerGuildEmoji = any;
type FluxerGuildSticker = any;
type FluxerGuildMemberData = any;
type FluxerPresenceRecord = any;
type FluxerVoiceState = any;
type FluxerGuildRole = any;
type FluxerRelationship = any;
type FluxerFavoriteMeme = any;
type FluxerGatewayGuildSettings = any;
type FluxerGatewayReadState = any;
type FluxerRtcRegionResponse = any;
type FluxerRequiredAction = any;
type FluxerPendingBulkMessageDeletion = any;

interface FluxerGuildReadyData {
  id: string;
  properties: Omit<FluxerGuild, "roles">;
  channels: ReadonlyArray<FluxerChannel>;
  emojis: ReadonlyArray<FluxerGuildEmoji>;
  stickers?: ReadonlyArray<FluxerGuildSticker>;
  members: ReadonlyArray<FluxerGuildMemberData>;
  member_count: number;
  presences?: ReadonlyArray<FluxerPresenceRecord>;
  voice_states?: ReadonlyArray<FluxerVoiceState>;
  roles: ReadonlyArray<FluxerGuildRole>;
  joined_at: string;
  unavailable?: boolean;
}

export interface FluxerReady {
  session_id: string;
  guilds: Array<FluxerGuildReadyData>;
  user: FluxerUserPrivate;
  private_channels?: Array<FluxerChannel>;
  notes?: Record<string, string>;
  country_code?: string;
  pinned_dms?: Array<string>;
  relationships?: Array<FluxerRelationship>;
  favorite_memes?: Array<FluxerFavoriteMeme>;
  users?: Array<FluxerUser>;
  user_settings?: FluxerUserSettings;
  user_guild_settings?: Array<FluxerGatewayGuildSettings>;
  read_states?: Array<FluxerGatewayReadState>;
  presences?: Array<FluxerPresenceRecord>;
  auth_session_id_hash?: string;
  rtc_regions?: Array<FluxerRtcRegionResponse>;
}

export interface FluxerGuildFolder {
  id: number | null;
  name: string | null;
  color: number | null;
  flags: number;
  icon: string;
  guild_ids: Array<string>;
}

export interface FluxerCustomStatus {
  text?: string | null;
  expires_at?: string | null;
  emoji_id?: string | null;
  emoji_name?: string | null;
  emoji_animated?: boolean | null;
}

export interface FluxerUserSettings {
  flags: number;
  status: string;
  status_resets_at: string | null;
  status_resets_to: string | null;
  theme: string;
  time_format: number;
  locale: string;
  restricted_guilds: Array<string>;
  bot_restricted_guilds: Array<string>;
  default_guilds_restricted: boolean;
  bot_default_guilds_restricted: boolean;
  inline_attachment_media: boolean;
  inline_embed_media: boolean;
  gif_auto_play: boolean;
  render_embeds: boolean;
  render_reactions: boolean;
  animate_emoji: boolean;
  animate_stickers: number;
  render_spoilers: number;
  message_display_compact: boolean;
  developer_mode: boolean;
  friend_source_flags: number;
  incoming_call_flags: number;
  group_dm_add_permission_flags: number;
  guild_folders: Array<FluxerGuildFolder>;
  custom_status: FluxerCustomStatus | null;
  afk_timeout: number;
  trusted_domains: Array<string>;
  default_hide_muted_channels: boolean;
}
export interface FluxerUserProfile {
  bio: string | null;
  banner: string | null;
  banner_color?: number | null;
  pronouns: string | null;
  accent_color: number | null;
}

export interface FluxerUserPartial {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
  avatar_color: number | null;
  bot?: boolean;
  system?: boolean;
  flags: number;
}

export interface FluxerUserPrivate
  extends FluxerUserPartial, FluxerUserProfile {
  is_staff: boolean;
  email: string | null;
  email_bounced?: boolean;
  mfa_enabled: boolean;
  phone: string | null;
  authenticator_types: ReadonlyArray<number>;
  verified: boolean;
  premium_type: number | null;
  premium_since: string | null;
  premium_until: string | null;
  premium_will_cancel: boolean;
  premium_billing_cycle: string | null;
  premium_lifetime_sequence: number | null;
  premium_badge_hidden: boolean;
  premium_badge_masked: boolean;
  premium_badge_timestamp_hidden: boolean;
  premium_badge_sequence_hidden: boolean;
  premium_purchase_disabled: boolean;
  premium_enabled_override: boolean;
  password_last_changed_at: string | null;
  required_actions: ReadonlyArray<FluxerRequiredAction> | null;
  nsfw_allowed: boolean;
  pending_bulk_message_deletion: FluxerPendingBulkMessageDeletion | null;
  has_dismissed_premium_onboarding: boolean;
  has_ever_purchased: boolean;
  has_unread_gift_inventory: boolean;
  unread_gift_inventory_count: number;
  used_mobile_client: boolean;
  traits: ReadonlyArray<string>;
}

export type FluxerUser = FluxerUserPartial & Partial<FluxerUserPrivate>;

export const UserPremiumTypes = {
  NONE: 0,
  SUBSCRIPTION: 1,
  LIFETIME: 2,
} as const;

export const UserPremiumTypesDescriptions: Record<
  keyof typeof UserPremiumTypes,
  string
> = {
  NONE: "No premium subscription",
  SUBSCRIPTION: "Active premium subscription",
  LIFETIME: "Lifetime premium subscription",
};

export const FluxerUserFlags = {
  STAFF: 1n << 0n,
  CTP_MEMBER: 1n << 1n,
  PARTNER: 1n << 2n,
  BUG_HUNTER: 1n << 3n,
  HIGH_GLOBAL_RATE_LIMIT: 1n << 33n,
  FRIENDLY_BOT: 1n << 4n,
  FRIENDLY_BOT_MANUAL_APPROVAL: 1n << 5n,
  DELETED: 1n << 34n,
  DISABLED_SUSPICIOUS_ACTIVITY: 1n << 35n,
  SELF_DELETED: 1n << 36n,
  PREMIUM_DISCRIMINATOR: 1n << 37n,
  DISABLED: 1n << 38n,
  HAS_SESSION_STARTED: 1n << 39n,
  PREMIUM_BADGE_HIDDEN: 1n << 40n,
  PREMIUM_BADGE_MASKED: 1n << 41n,
  PREMIUM_BADGE_TIMESTAMP_HIDDEN: 1n << 42n,
  PREMIUM_BADGE_SEQUENCE_HIDDEN: 1n << 43n,
  PREMIUM_PERKS_SANITIZED: 1n << 44n,
  PREMIUM_PURCHASE_DISABLED: 1n << 45n,
  PREMIUM_ENABLED_OVERRIDE: 1n << 46n,
  RATE_LIMIT_BYPASS: 1n << 47n,
  REPORT_BANNED: 1n << 48n,
  VERIFIED_NOT_UNDERAGE: 1n << 49n,
  HAS_DISMISSED_PREMIUM_ONBOARDING: 1n << 51n,
  USED_MOBILE_CLIENT: 1n << 52n,
  APP_STORE_REVIEWER: 1n << 53n,
  DM_HISTORY_BACKFILLED: 1n << 54n,
  HAS_RELATIONSHIPS_INDEXED: 1n << 55n,
  MESSAGES_BY_AUTHOR_BACKFILLED: 1n << 56n,
  STAFF_HIDDEN: 1n << 57n,
  BOT_SANITIZED: 1n << 58n,
} as const;

export interface FluxerProfile {
  connected_accounts: any[];
  mutual_friends: FluxerRelationship[];
  mutual_guilds: Array<{ id: string; nick?: string | null }>;
  premium_type?: number;
  premium_since?: string | null;
  guild_member?: any;
  guild_member_profile?: any;
  timezone_offset?: number | null;
  profile_limited?: boolean;
  user: FluxerUserPartial;
  user_profile: FluxerUserProfile;
}
