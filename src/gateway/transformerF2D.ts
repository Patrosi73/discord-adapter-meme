import {
    PreloadedUserSettings,
    PreloadedUserSettings_LaunchPadMode,
    PreloadedUserSettings_SwipeRightToLeftMode,
    PreloadedUserSettings_Theme,
    PreloadedUserSettings_TimestampHourCycle,
    PreloadedUserSettings_UIDensity,
    type PreloadedUserSettings_GuildFolders
} from "discord-protos";
import { LOCAL_WEBSOCKET_HOST } from "../constants.ts";
import {
    DiscordUserFlags,
    type DiscordChannelOverride,
    type DiscordGuildMember,
    type DiscordPartialEmoji,
    type DiscordProfileBadge,
    type DiscordProfileMetadata,
    type DiscordReaction,
    type DiscordReadState,
    type DiscordReady,
    type DiscordSession,
    type DiscordUserGuildSettings,
    type VersionedArray
} from "./discordStructs.ts";
import {
    FluxerUserFlags,
    type FluxerChannelOverride,
    type FluxerGuild,
    type FluxerProfile,
    type FluxerSession,
    type FluxerUser,
    type FluxerUserProfile,
    type FluxerUserSettings
} from "./fluxerStructs.ts";
import { mergeStoredSettingsProto } from "../settingsProto.ts";
import { getNotificationSettings } from "../notificationSettings.ts";
import {
    dispatchDiscoveredEmojiUpdates,
    mergeDiscoveredEmojis,
    registerEmojisFromMessage,
    registerGuildChannel,
    registerGuildChannels,
    resolveMessageGuildId
} from "../emojiRegistry.ts";

export function transformChannelF2D(channel: any): any {
    registerGuildChannel(channel);

    return {
        ...channel,
        recipients: channel.recipients?.map((recipient: any) => transformUserF2D(recipient))
    };
}

function transformUserFlagsF2D(userFlags: number | string | bigint = 0): bigint {
    userFlags = BigInt(userFlags);
    let flags = 0n;

    if (userFlags & FluxerUserFlags.STAFF) flags |= DiscordUserFlags.STAFF;
    if (userFlags & FluxerUserFlags.PARTNER) flags |= DiscordUserFlags.PARTNER;
    if (userFlags & FluxerUserFlags.BUG_HUNTER) flags |= DiscordUserFlags.BUG_HUNTER_LEVEL_1;

    return flags;
}

function transformMessageFlagsF2D(messageFlags: number | string | bigint = 0): number {
    messageFlags = BigInt(messageFlags);
    let flags = 0;

    return flags;
}

export function fluxerFlagsToBadges(flags: string | number | bigint, premium_type: number = 0): DiscordProfileBadge[] {
    flags = BigInt(flags);
    const badges: DiscordProfileBadge[] = [];

    if (flags & FluxerUserFlags.STAFF)
        badges.push({
            id: "staff",
            description: "Fluxer Staff",
            icon: "../badges/staff.svg?x=", // TODO: oops it's on fluxerstatic.com not fluxerusercontent.com
            link: "https://fluxer.app/careers"
        });

    if (flags & FluxerUserFlags.PARTNER)
        badges.push({
            id: "partner",
            description: "Fluxer Partner",
            icon: "../badges/partner.svg?x=",
            link: "https://fluxer.app/partners"
        });

    if (flags & FluxerUserFlags.BUG_HUNTER)
        badges.push({
            id: "bug_hunter",
            description: "Fluxer Bug Hunter",
            icon: "../badges/bug-hunter.svg?x=",
            link: "https://fluxer.app/bugs"
        });

    if (premium_type === 1 || premium_type === 2)
        badges.push({
            id: "plutonium",
            description: "Fluxer Plutonium",
            icon: "../badges/plutonium.svg?x=",
            link: "https://fluxer.app/plutonium"
        });

    return badges;
}

export function transformUserF2D(user: FluxerUser, hack: boolean = false): any {
    let flags = user.flags !== undefined ? BigInt(user.flags) : undefined;
    let transformedFlags = undefined;
    if (flags !== undefined) {
        if (hack) {
            flags |= FluxerUserFlags.STAFF;
        }
        transformedFlags = transformUserFlagsF2D(flags);
    }

    return {
        ...user,
        // discriminator: user.discriminator === "0000" ? "0" : user.discriminator, // potentially breaks stuff
        flags: transformedFlags?.toString(),
        public_flags: transformedFlags?.toString(),
        display_name: user.global_name,
        display_name_styles: null,
        avatar_decoration_data: null,
        primary_guild: null
    };
}

export function transformPartialUserF2D(user: FluxerUser): any {
    const transformed = transformUserF2D(user);
    const publicFlags = Number(transformed.public_flags ?? 0);

    return {
        id: transformed.id,
        username: transformed.username,
        global_name: transformed.global_name,
        avatar: transformed.avatar,
        avatar_decoration_data: transformed.avatar_decoration_data ?? null,
        discriminator: transformed.discriminator,
        public_flags: publicFlags,
        primary_guild: transformed.primary_guild ?? null
    };
}

export function transformMutualRelationshipsF2D(profile: FluxerProfile): any[] {
    return (
        profile.mutual_friends?.map(friend => {
            const user = friend?.user ?? friend;
            return transformPartialUserF2D(user);
        }) ?? []
    );
}

export function transformMemberF2D(member: any): DiscordGuildMember {
    const userId = member.user?.id;

    return {
        ...member,
        flags: 0,
        pending: false,
        user: member.user ? transformUserF2D(member.user) : undefined,
        presence: member.presence && userId ? transformPresenceF2D(member.presence, userId) : undefined
    };
}

export function transformUserProfileF2D(
    profile: FluxerUserProfile,
    guildId?: string | string[]
): DiscordProfileMetadata {
    const resolvedGuildId = Array.isArray(guildId) ? guildId[0] : guildId;

    const metadata: DiscordProfileMetadata = {
        pronouns: profile.pronouns ?? "",
        bio: profile.bio ?? undefined,
        banner: profile.banner,
        accent_color: profile.accent_color ?? profile.banner_color ?? null
    };

    if (resolvedGuildId) {
        metadata.guild_id = resolvedGuildId;
    }

    return metadata;
}

export function transformProfileF2D(profile: FluxerProfile, options: ProfileTransformOptions = {}): any {
    const {
        guildId,
        withMutualGuilds = true,
        withMutualFriends = false,
        withMutualFriendsCount = false
    } = options;
    const resolvedGuildId = Array.isArray(guildId) ? guildId[0] : guildId;
    const profileLimited = profile.profile_limited ?? false;

    const user = transformProfileUserF2D(profile.user, profile.user_profile);

    if (profileLimited) {
        const limited: Record<string, unknown> = {
            user,
            profile_limited: true
        };

        if (profile.timezone_offset !== undefined) {
            limited.timezone_offset = profile.timezone_offset;
        }

        return limited;
    }

    const mutualFriends = transformMutualRelationshipsF2D(profile);

    const result: Record<string, unknown> = {
        user,
        user_profile: transformUserProfileF2D(profile.user_profile, guildId),
        badges: fluxerFlagsToBadges(profile.user.flags, profile.premium_type),
        connected_accounts: profile.connected_accounts?.map(transformProfileConnectedAccountF2D) ?? [],
        premium_type: profile.premium_type ?? 0,
        premium_since: profile.premium_since ?? null,
        guild_badges: []
    };

    if (profile.premium_guild_since !== undefined) {
        result.premium_guild_since = profile.premium_guild_since;
    }

    if (withMutualGuilds) {
        result.mutual_guilds =
            profile.mutual_guilds?.map(guild => ({
                id: guild.id,
                nick: guild.nick ?? null
            })) ?? [];
    }

    if (withMutualFriends) {
        result.mutual_friends = mutualFriends;
    }

    if (withMutualFriendsCount) {
        result.mutual_friends_count = mutualFriends.length;
    }

    if (resolvedGuildId && profile.guild_member) {
        result.guild_member = transformMemberF2D(profile.guild_member);
    }

    if (resolvedGuildId && profile.guild_member_profile) {
        result.guild_member_profile = profile.guild_member_profile;
    }

    if (profile.timezone_offset !== undefined) {
        result.timezone_offset = profile.timezone_offset;
    }

    return result;
}

export function transformPresenceF2D(presence: any, userId: bigint | string): any {
    return {
        activities: [],
        ...presence,
        client_status: {
            desktop: presence.status,
            mobile: presence.mobile ? presence.status : undefined
        },
        processed_at_timestamp: Date.now(),
        user: { id: userId.toString(), ...(presence.user ?? {}) }
    };
}

export function transformEmojiF2D(emoji: any): DiscordPartialEmoji {
    return {
        name: emoji.name,
        id: emoji.id ?? null,
        animated: emoji.animated ?? false,
        available: true,
        managed: emoji.managed ?? false,
        require_colons: !!emoji.id, // custom emojis require colons
        roles: emoji.roles ?? []
    };
}

export function transformStickerF2D(sticker: any): any {
    return {
        name: sticker.name,
        id: sticker.id ?? null,
        available: true,
        roles: []
    };
}

function normalizeFluxerGuild(guild: any): FluxerGuild {
    if (!guild?.properties) {
        return guild;
    }

    return {
        ...guild.properties,
        ...guild,
        channels: guild.channels ?? guild.properties.channels,
        emojis: guild.emojis ?? guild.properties.emojis,
        stickers: guild.stickers ?? guild.properties.stickers,
        members: guild.members ?? guild.properties.members,
        member_count: guild.member_count ?? guild.properties.member_count,
        joined_at: guild.joined_at ?? guild.properties.joined_at,
        unavailable: guild.unavailable ?? guild.properties.unavailable
    };
}

export function transformReactionF2D(reaction: any): DiscordReaction {
    return {
        count: reaction.count,
        count_details: {
            normal: reaction.count,
            burst: 0
        },
        me: false,
        me_burst: false,
        burst_me: false,
        emoji: transformEmojiF2D(reaction.emoji),
        burst_colors: [],
        burst_count: 0
    };
}

export function transformConnectedAccountF2D(account: any): any {
    const normalized = { ...account };

    if (normalized.type === "domain") {
        normalized.id = normalized.name ?? normalized.id;
    }

    if (normalized.type === "bsky") {
        normalized.type = "bluesky";
        normalized.id = normalized.name ?? normalized.id;
    }

    normalized.visibility = normalized.visibility_flags;

    normalized.friend_sync = false;
    normalized.integrations = [];
    normalized.show_activity = true;
    normalized.two_way_link = false;
    normalized.verified = true;
    normalized.revoked = false;
    delete normalized.visibility_flags;

    delete normalized.sort_order;

    return normalized;
}

function transformProfileConnectedAccountF2D(account: any): any {
    const normalized = transformConnectedAccountF2D(account);
    const result: Record<string, unknown> = {
        type: normalized.type,
        id: normalized.id,
        name: normalized.name,
        verified: normalized.verified
    };

    if (normalized.metadata) {
        result.metadata = normalized.metadata;
    }

    return result;
}

function transformProfileUserF2D(user: FluxerUser, userProfile: FluxerUserProfile): any {
    const transformed = transformUserF2D(user);
    const flags = Number(transformed.public_flags ?? 0);

    const profileUser: Record<string, unknown> = {
        id: transformed.id,
        username: transformed.username,
        global_name: transformed.global_name,
        avatar: transformed.avatar,
        avatar_decoration_data: transformed.avatar_decoration_data ?? null,
        discriminator: transformed.discriminator,
        display_name_styles: transformed.display_name_styles ?? null,
        public_flags: flags,
        primary_guild: transformed.primary_guild ?? null,
        flags,
        banner: userProfile.banner ?? null,
        banner_color: userProfile.banner_color ?? null,
        accent_color: userProfile.accent_color ?? userProfile.banner_color ?? null,
        bio: userProfile.bio ?? null
    };

    if (transformed.collectibles) {
        profileUser.collectibles = transformed.collectibles;
    }

    if (transformed.primary_guild) {
        profileUser.clan = transformed.primary_guild;
    }

    return profileUser;
}

export interface ProfileTransformOptions {
    guildId?: string | string[];
    withMutualGuilds?: boolean;
    withMutualFriends?: boolean;
    withMutualFriendsCount?: boolean;
}

export function parseProfileQueryFlag(
    value: string | string[] | undefined,
    defaultValue: boolean
): boolean {
    const resolved = Array.isArray(value) ? value[0] : value;
    if (resolved === undefined) {
        return defaultValue;
    }
    return resolved === "true";
}

export function getProfileTransformOptionsFromQuery(query: Record<string, unknown>): ProfileTransformOptions {
    return {
        guildId: query.guild_id as string | string[] | undefined,
        withMutualGuilds: parseProfileQueryFlag(query.with_mutual_guilds as string | string[] | undefined, true),
        withMutualFriends: parseProfileQueryFlag(query.with_mutual_friends as string | string[] | undefined, false),
        withMutualFriendsCount: parseProfileQueryFlag(
            query.with_mutual_friends_count as string | string[] | undefined,
            false
        )
    };
}

function transformMessageSnapshotFieldsF2D(snapshot: any): any {
    return {
        type: snapshot.type ?? 0,
        content: snapshot.content ?? "",
        timestamp: snapshot.timestamp,
        edited_timestamp: snapshot.edited_timestamp ?? null,
        flags: transformMessageFlagsF2D(snapshot.flags ?? 0),
        mentions: snapshot.mentions ?? [],
        mention_roles: snapshot.mention_roles ?? [],
        mention_channels: snapshot.mention_channels ?? [],
        embeds: snapshot.embeds ?? [],
        attachments: snapshot.attachments ?? [],
        stickers: snapshot.stickers ?? [],
        components: snapshot.components ?? []
    };
}

function transformMessageSnapshotsF2D(snapshots: any[] | null | undefined): any[] | undefined {
    if (!snapshots) {
        return undefined;
    }

    return snapshots.map(snapshot => ({
        message: transformMessageSnapshotFieldsF2D(snapshot.message ?? snapshot)
    }));
}

export function transformMessageF2D(message: any): any {
    const guildId = resolveMessageGuildId(message);
    const discoveredNewEmoji = registerEmojisFromMessage(message);

    const { channel, users: _users, message_snapshots, ...messageWithoutChannel } = message;
    const transformedReferencedMessage = message.referenced_message
        ? transformMessageF2D({
              guild_id: guildId,
              channel_id: message.channel_id,
              ...message.referenced_message
          })
        : undefined;

    const transformed = {
        tts: message.tts ?? false,
        mention_roles: [],
        components: [],
        ...messageWithoutChannel,
        ...(guildId ? { guild_id: guildId } : {}),
        embeds: message.embeds ?? [],
        attachments: message.attachments ?? [],
        stickers: message.stickers ?? [],
        mention_channels: message.mention_channels ?? [],
        message_snapshots: transformMessageSnapshotsF2D(message_snapshots),
        flags: transformMessageFlagsF2D(message.flags ?? 0),
        author: message.author ? transformUserF2D(message.author) : undefined,
        referenced_message: transformedReferencedMessage,
        reactions: message.reactions?.map(transformReactionF2D) ?? []
    };

    if (discoveredNewEmoji && guildId) {
        dispatchDiscoveredEmojiUpdates(guildId);
    }

    return transformed;
}

export function transformGuildF2D(guild: FluxerGuild): any {
    guild = normalizeFluxerGuild(guild);

    registerGuildChannels(guild.id, guild.channels);

    const baseEmojis = guild.emojis?.map(transformEmojiF2D) ?? [];
    const emojis = mergeDiscoveredEmojis(guild.id, baseEmojis);

    return {
        version: Date.now(),
        premium_tier: 0,
        lazy: false,
        large: (guild.member_count ?? 0) > 250,
        threads: [],
        activity_instances: [],
        stage_instances: [],
        guild_scheduled_events: [],
        soundboard_sounds: [],
        premium_subscription_count: 0,
        application_command_counts: {},
        data_mode: "full",
        ...guild,
        channels: guild.channels?.map(transformChannelF2D),
        emojis,
        stickers: guild.stickers?.map(transformStickerF2D) ?? [],
        members: guild.members?.map(transformMemberF2D)
    };
}

export function transformUserSettingsToProtoF2D(settings: FluxerUserSettings): string {
    const theme =
        {
            coal: PreloadedUserSettings_Theme.MIDNIGHT,
            dark: PreloadedUserSettings_Theme.DARKER,
            light: PreloadedUserSettings_Theme.LIGHT
        }[settings.theme] ?? PreloadedUserSettings_Theme.UNSET;

    const guildFolders: PreloadedUserSettings_GuildFolders = {
        folders: [],
        guildPositions: []
    };

    for (const folder of settings.guild_folders) {
        if (folder.id === -1) {
            // not in a folder
            for (const guildId of folder.guild_ids) {
                guildFolders.folders.push({
                    guildIds: [BigInt(guildId)]
                });
                guildFolders.guildPositions.push(BigInt(guildId));
            }
            continue;
        }

        guildFolders.folders.push({
            guildIds: folder.guild_ids.map(BigInt),
            id: folder.id ? { value: BigInt(folder.id!) } : undefined,
            color: folder.color ? { value: BigInt(folder.color!) } : undefined,
            name: folder.name ? { value: folder.name! } : undefined
        });

        for (const guildId of folder.guild_ids) {
            guildFolders.guildPositions.push(BigInt(guildId));
        }
    }

    return PreloadedUserSettings.toBase64({
        versions: {
            clientVersion: 20,
            serverVersion: 0,
            dataVersion: 1234
        },
        status: {
            status: { value: settings.status },
            statusExpiresAtMs: settings.status_resets_at ? BigInt(new Date(settings.status_resets_at).getTime()) : 0n,
            customStatus: settings.custom_status
                ? {
                      text: settings.custom_status.text ?? "",
                      createdAtMs: 0n,
                      expiresAtMs: settings.custom_status.expires_at
                          ? BigInt(new Date(settings.custom_status.expires_at).getTime())
                          : 0n,
                      emojiId: settings.custom_status.emoji_id ? BigInt(settings.custom_status.emoji_id) : 0n,
                      emojiName: settings.custom_status.emoji_name ?? "",
                      label: undefined
                  }
                : undefined,
            statusCreatedAtMs: { value: 0n },
            showCurrentGame: { value: false }
        },
        appearance: {
            theme,
            developerMode: settings.developer_mode,
            launchPadMode: PreloadedUserSettings_LaunchPadMode.LAUNCH_PAD_DISABLED,
            mobileRedesignDisabled: false,
            swipeRightToLeftMode: PreloadedUserSettings_SwipeRightToLeftMode.SWIPE_RIGHT_TO_LEFT_UNSET,
            timestampHourCycle: PreloadedUserSettings_TimestampHourCycle.AUTO,
            uiDensity: PreloadedUserSettings_UIDensity.UI_DENSITY_DEFAULT,
            happeningNowCardsDisabled: {
                value: true
            }
        },
        guildFolders,
        localization: {
            locale: {
                value: settings.locale
            }
        },
        debug: {},
        gameLibrary: {
            disableGamesTab: { value: true }
        },
        applications: {
            appSettings: {}
        },
        inAppFeedbackSettings: {
            inAppFeedbackStates: {}
        }
    });
}

function transformUserGuildSettingsF2D(settings: any[]): VersionedArray<DiscordUserGuildSettings> {
    const entries: DiscordUserGuildSettings[] = [];

    for (const setting of settings) {
        const channelOverrides: DiscordChannelOverride[] = [];

        if (setting.channel_overrides == null) {
            console.warn(
                `[transformUserGuildSettingsF2D] guild ${setting.guild_id} has null/undefined channel_overrides; skipping`
            );
        }

        for (const [channelId, settings] of Object.entries<FluxerChannelOverride>(setting.channel_overrides ?? {})) {
            channelOverrides.push({
                channel_id: channelId,
                collapsed: settings.collapsed,
                message_notifications: settings.message_notifications,
                muted: settings.muted,
                mute_config: settings.mute_config
            });
        }

        entries.push({
            channel_overrides: channelOverrides,
            flags: 0,
            guild_id: setting.guild_id,
            hide_muted_channels: setting.hide_muted_channels,
            message_notifications: setting.message_notifications,
            mobile_push: setting.mobile_push,
            mute_scheduled_events: setting.mute_scheduled_events,
            muted: setting.muted,
            mute_config: setting.mute_config,
            notify_highlights: setting.notify_highlights,
            suppress_everyone: setting.suppress_everyone,
            suppress_roles: setting.suppress_roles,
            version: 1
        });
    }

    return {
        entries,
        version: 1,
        partial: false
    };
}

function transformReadStateF2D(readState: any): DiscordReadState {
    return {
        read_state_type: 0, // channel
        id: readState.id,
        last_message_id: readState.last_message_id,
        last_acked_id: readState.last_acked_id ?? readState.last_message_id,
        mention_count: readState.mention_count,
        badge_count: readState.badge_count,
        last_pin_timestamp: readState.last_pin_timestamp,
        flags: readState.flags,
        last_viewed: readState.last_viewed
    };
}

function transformSessionF2D(session: FluxerSession): DiscordSession {
    return {
        session_id: session.session_id,
        client_info: {
            client: session.mobile ? "mobile" : "desktop",
            os: "unknown",
            version: 0
        },
        status: session.status,
        activities: [],
        hidden_activities: [],
        active: !session.afk
    };
}

function transformReadyF2D(payload: any, settingsProtoAuthKey?: string): any {
    const currSessionId = payload.d.session_id;
    const sessions = payload.d.sessions ?? [];
    const transformedGuilds = payload.d.guilds.map(transformGuildF2D);
    const mergedMembers = payload.d.guilds.map((guild: any) => {
        const normalizedGuild = normalizeFluxerGuild(guild);
        return normalizedGuild.members?.map(transformMemberF2D) ?? [];
    });
    const userSettingsProto = mergeStoredSettingsProto(
        1,
        settingsProtoAuthKey,
        transformUserSettingsToProtoF2D(payload.d.user_settings)
    );
    const notificationSettings = getNotificationSettings(settingsProtoAuthKey);

    const transformedPrivateChannels = payload.d.private_channels?.map(transformChannelF2D) ?? [];

    const allUsersMap = new Map<string, any>();
    for (const user of payload.d.users ?? []) {
        allUsersMap.set(user.id, user);
    }
    for (const channel of payload.d.private_channels ?? []) {
        for (const recipient of channel.recipients ?? []) {
            if (!allUsersMap.has(recipient.id)) {
                allUsersMap.set(recipient.id, recipient);
            }
        }
    }
    const allUsers = Array.from(allUsersMap.values()).map(user => transformUserF2D(user));

    payload = {
        op: 0,
        t: "READY",
        d: {
            _: ["fluxer-adapter"],
            v: 9,
            user: transformUserF2D(payload.d.user, true),
            notification_settings: notificationSettings,
            user_guild_settings: transformUserGuildSettingsF2D(payload.d.user_guild_settings),
            read_state: {
                entries: payload.d.read_states.map(transformReadStateF2D),
                version: 1,
                partial: false
            },
            guilds: transformedGuilds,
            guild_join_requests: [],
            relationships: payload.d.relationships ?? [],
            game_relationships: [],
            friend_suggestion_count: 0,
            private_channels: transformedPrivateChannels,
            connected_accounts: payload.d.connected_accounts?.map(transformConnectedAccountF2D) ?? [],
            notes: payload.d.notes,
            presences: payload.d.presences?.map((p: any) => transformPresenceF2D(p, p.user.id)),
            merged_presences: {},
            merged_members: mergedMembers,
            users: allUsers,
            linked_users: [],
            session_id: currSessionId,
            session_type: "normal",
            sessions: sessions.map(transformSessionF2D),
            static_client_session_id: currSessionId,
            auth_session_id_hash: payload.d.auth_session_id_hash,
            analytics_token: "",
            authenticator_types: 0,
            country_code: payload.d.country_code,
            geo_ordered_rtc_regions: [],
            consents: {},
            tutorial: null,
            resume_gateway_url: `ws://${LOCAL_WEBSOCKET_HOST}`,
            api_code_version: 9,
            experiments: [],
            guild_experiments: [],
            explicit_content_scan_version: 0,
            pending_payments: [],
            av_sf_protocol_floor: 0,
            feature_flags: {},
            lobbies: [],
            user_application_profiles: {},
            connection_request_data: {},
            user_settings_proto: userSettingsProto
        } as DiscordReady,
        s: payload.s
    };
    return payload;
}

function transformMessageCreateF2D(payload: any): any {
    return {
        op: 0,
        t: "MESSAGE_CREATE",
        d: transformMessageF2D(payload.d),
        s: payload.s
    };
}

function transformMessageUpdateF2D(payload: any): any {
    return {
        op: 0,
        t: "MESSAGE_UPDATE",
        d: transformMessageF2D(payload.d),
        s: payload.s
    };
}

function transformSessionsReplaceF2D(payload: any): any {
    return {
        op: 0,
        t: "SESSIONS_REPLACE",
        d: payload.d.map(transformSessionF2D),
        s: payload.s
    };
}

function transformGuildCreateF2D(payload: any): any {
    return {
        op: 0,
        t: "GUILD_CREATE",
        d: transformGuildF2D(payload.d),
        s: payload.s
    };
}

function transformGuildEmojisUpdateF2D(payload: any): any {
    const guildId = payload.d.guild_id;
    const emojis = payload.d.emojis?.map(transformEmojiF2D) ?? [];
    const transformedEmojis = mergeDiscoveredEmojis(guildId, emojis);

    return {
        op: 0,
        t: "GUILD_EMOJIS_UPDATE",
        d: {
            guild_id: guildId,
            emojis: transformedEmojis
        },
        s: payload.s
    };
}

function transformGuildUpdateF2D(payload: any): any {
    return {
        op: 0,
        t: "GUILD_UPDATE",
        d: transformGuildF2D(payload.d),
        s: payload.s
    };
}

function transformGuildSyncF2D(payload: any) {
    const payloads: any[] = [];

    payloads.push({
        op: 0,
        t: "GUILD_SYNC",
        d: transformGuildF2D(payload.d),
        s: payload.s
    });

    const roles = payload.d.roles;
    if (roles) {
        for (const role of roles) {
            payloads.push({
                op: 0,
                t: "GUILD_ROLE_UPDATE",
                d: {
                    guild_id: payload.d.id,
                    role
                },
                s: payload.s
            });
        }
    }

    const emojis = payload.d.emojis;
    if (emojis) {
        const transformedEmojis = mergeDiscoveredEmojis(
            payload.d.id,
            emojis.map(transformEmojiF2D)
        );
        payloads.push({
            op: 0,
            t: "GUILD_EMOJIS_UPDATE",
            d: {
                guild_id: payload.d.id,
                emojis: transformedEmojis
            },
            s: payload.s
        });
    }

    const stickers = payload.d.stickers;
    if (stickers) {
        payloads.push({
            op: 0,
            t: "GUILD_STICKERS_UPDATE",
            d: {
                guild_id: payload.d.id,
                stickers: stickers.map(transformStickerF2D)
            },
            s: payload.s
        });
    }

    const channels = payload.d.channels;
    if (channels) {
        for (const channel of channels) {
            payloads.push({
                op: 0,
                t: "CHANNEL_UPDATE_PARTIAL",
                d: {
                    guild_id: payload.d.id,
                    channel: transformChannelF2D(channel)
                },
                s: payload.s
            });
        }
    }

    // const members = payload.d.members;
    // if (members) {
    //   for (const member of members) {
    //     payloads.push({
    //       op: 0,
    //       t: "GUILD_MEMBER_UPDATE",
    //       d: {
    //         guild_id: payload.d.id,
    //         member: transformMemberF2D(member),
    //       },
    //       s: payload.s,
    //     });
    //   }
    // }

    return payloads;
}

function transformGMLItemF2D(item: any): any {
    return {
        ...item,
        member: item.member ? transformMemberF2D(item.member) : undefined
    };
}

function transformGuildMemberListUpdateOpF2D(op: any, payload: any, injectGroups: boolean): any {
    if (op.op === "SYNC") {
        const range: [number, number] = op.range;
        const [start, end] = range;

        const items: any[] = [];

        const groupStartOffsets: Array<{ start: number; id: string }> = [];

        let groupStartOffset = 0;
        for (const group of payload.d.groups) {
            groupStartOffsets.push({
                start: groupStartOffset,
                id: group.id
            });
            groupStartOffset += group.count;
        }

        for (let i = 0; i < op.items.length; i++) {
            const itemOffset = i + start;

            if (injectGroups) {
                const groupToInject = groupStartOffsets.find(g => g.start === itemOffset);
                if (groupToInject) {
                    items.push({
                        group: {
                            id: groupToInject.id
                        }
                    });
                }
            }

            const item = op.items[i];
            if (item) {
                items.push(transformGMLItemF2D(item));
            }
        }

        return {
            ...op,
            items
        };
    } else {
        return {
            ...op,
            item: op.item ? transformGMLItemF2D(op.item) : undefined
        };
    }
}

function transformGuildMemberUpdate(payload: any): any {
    return {
        op: 0,
        t: "GUILD_MEMBER_UPDATE",
        d: {
            guild_id: payload.d.guild_id,
            member: transformMemberF2D(payload.d.member)
        },
        s: payload.s
    };
}

function transformGuildMemberListUpdateF2D(payload: any): any {
    const payloads: any[] = [];

    const transformedOps = payload.d.ops.map((op: any) => transformGuildMemberListUpdateOpF2D(op, payload, false));

    // big haaaaack :3
    // I think that we need non-trivial state tracking in the proxy to solve this sanely?
    const shouldSendEveryone = transformedOps.some((op: any) => op.op === "SYNC" && op.range[0] === 0);
    if (shouldSendEveryone) {
        payloads.push({
            op: 0,
            t: "GUILD_MEMBER_LIST_UPDATE",
            d: {
                ops: transformedOps,
                guild_id: payload.d.guild_id,
                groups: payload.d.groups,
                id: "everyone",
                member_count: payload.d.member_count,
                online_count: payload.d.online_count
            },
            s: payload.s
        });
    }

    payloads.push({
        op: 0,
        t: "GUILD_MEMBER_LIST_UPDATE",
        d: {
            ...payload.d,
            ops: transformedOps
        },
        s: payload.s
    });

    return payloads;
}

function transformPresenceUpdateF2D(payload: any): any {
    return {
        op: 0,
        t: "PRESENCE_UPDATE",
        d: transformPresenceF2D(payload.d, payload.d.user.id),
        s: payload.s
    };
}

function transformUserSettingsUpdateF2D(payload: any, settingsProtoAuthKey?: string): any {
    return {
        op: 0,
        t: "USER_SETTINGS_PROTO_UPDATE",
        d: {
            settings: {
                type: 1,
                value: mergeStoredSettingsProto(1, settingsProtoAuthKey, transformUserSettingsToProtoF2D(payload.d))
            },
            partial: true
        },
        s: payload.s
    };
}

function transformChannelCreateF2D(payload: any): any {
    return {
        op: 0,
        t: "CHANNEL_CREATE",
        d: transformChannelF2D(payload.d),
        s: payload.s
    };
}

function transformChannelUpdateF2D(payload: any): any {
    return {
        op: 0,
        t: "CHANNEL_UPDATE",
        d: transformChannelF2D(payload.d),
        s: payload.s
    };
}

function transformDispatchF2D(payload: any, settingsProtoAuthKey?: string): any {
    switch (payload.t) {
        case "READY": {
            return transformReadyF2D(payload, settingsProtoAuthKey);
        }
        case "CHANNEL_CREATE": {
            return transformChannelCreateF2D(payload);
        }
        case "CHANNEL_UPDATE": {
            return transformChannelUpdateF2D(payload);
        }
        case "MESSAGE_CREATE": {
            return transformMessageCreateF2D(payload);
        }
        case "MESSAGE_UPDATE": {
            return transformMessageUpdateF2D(payload);
        }
        case "SESSIONS_REPLACE": {
            return transformSessionsReplaceF2D(payload);
        }
        case "GUILD_CREATE": {
            return transformGuildCreateF2D(payload);
        }
        case "GUILD_UPDATE": {
            return transformGuildUpdateF2D(payload);
        }
        case "GUILD_SYNC": {
            return transformGuildSyncF2D(payload);
        }
        case "GUILD_EMOJIS_UPDATE": {
            return transformGuildEmojisUpdateF2D(payload);
        }
        case "GUILD_MEMBER_UPDATE": {
            return transformGuildMemberUpdate(payload);
        }
        case "GUILD_MEMBER_LIST_UPDATE": {
            return transformGuildMemberListUpdateF2D(payload);
        }
        case "PRESENCE_UPDATE": {
            return transformPresenceUpdateF2D(payload);
        }
        case "USER_SETTINGS_UPDATE": {
            return transformUserSettingsUpdateF2D(payload, settingsProtoAuthKey);
        }
        default:
            return payload;
    }
}

function transformSessionApiF2D(session: any): any {
    const location = session.client_info.location;
    const locationString = location ? `${location.city}, ${location.region}, ${location.country}` : "";

    return {
        id_hash: session.id_hash,
        approx_last_used_time: session.approx_last_used_at,
        client_info: {
            os: session.client_info.os,
            platform: session.client_info.platform,
            location: locationString
        }
    };
}

export function transformInviteApiF2D(invite: any): any {
    const { member_count, presence_count, ...rest } = invite;
    const guild = normalizeFluxerGuild(invite.guild);
    const features = guild.features || [];

    return {
        ...rest,
        guild_id: guild.id,
        guild: transformGuildF2D(guild),
        channel: transformChannelF2D(invite.channel),
        inviter: invite.inviter ? transformUserF2D(invite.inviter) : undefined,
        flags: invite.flags ?? 0,
        id: invite.id ?? 0,
        approximate_member_count: member_count,
        approximate_presence_count: presence_count,
        profile: {
            id: guild.id,
            name: guild.name,
            icon_hash: guild.icon,
            member_count: member_count,
            online_count: presence_count,
            description: guild.description || null,
            banner_hash: guild.banner,
            game_application_ids: [],
            game_activity: {},
            tag: null,
            badge: 0,
            badge_color_primary: null,
            badge_color_secondary: null,
            badge_hash: null,
            traits: [],
            features,
            visibility: features.includes("DISCOVERABLE") ? 1 : 0,
            custom_banner_hash: guild.embed_splash || guild.splash || null
        },
        is_nickname_changeable: false
    };
}

export function transformSessionsApiF2D(sessions: any[]): any {
    return {
        user_sessions: sessions.map(transformSessionApiF2D)
    };
}

export function transformF2D(payload: any, settingsProtoAuthKey?: string): any {
    switch (payload.op) {
        case 0: {
            return transformDispatchF2D(payload, settingsProtoAuthKey);
        }

        default:
            return payload;
    }
}
