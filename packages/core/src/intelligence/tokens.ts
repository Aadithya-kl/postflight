import { getPlatformSpec } from '../specs/registry.js';
import type { OAuthConnectionInput, OAuthTokenHealth, PlatformId } from '../types.js';

const META_PLATFORMS = new Set<PlatformId>([
  'instagram-feed',
  'instagram-reels',
  'threads',
]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function escalateStatus(
  current: OAuthTokenHealth['status'],
  minimum: OAuthTokenHealth['status'],
): OAuthTokenHealth['status'] {
  const rank: Record<OAuthTokenHealth['status'], number> = {
    healthy: 0,
    'expiring-soon': 1,
    critical: 2,
    expired: 3,
  };
  return rank[minimum] > rank[current] ? minimum : current;
}

export function auditOAuthTokens(
  connections: OAuthConnectionInput[],
  nowIso?: string,
): OAuthTokenHealth[] {
  const parsedNow = nowIso ? Date.parse(nowIso) : Date.now();
  const nowMs = Number.isNaN(parsedNow) ? Date.now() : parsedNow;

  return connections.map((conn): OAuthTokenHealth => {
    const spec = getPlatformSpec(conn.platform);
    const oauth = spec.oauth;
    const risks: string[] = [];

    const accessIssuedMs = Date.parse(conn.accessTokenIssuedAt);
    const validAccessIssued = !Number.isNaN(accessIssuedMs);
    const accessAgeHours = validAccessIssued
      ? (nowMs - accessIssuedMs) / 3_600_000
      : 0;

    if (!validAccessIssued) {
      risks.push(
        `Invalid accessTokenIssuedAt timestamp ("${conn.accessTokenIssuedAt}"); unable to calculate exact expiry.`,
      );
    }

    const accessHoursRemaining: number | null =
      oauth && oauth.accessTokenTtlHours !== null && validAccessIssued
        ? round2(oauth.accessTokenTtlHours - accessAgeHours)
        : null;

    // Determine refresh token presence and remaining days
    let hasUsableRefreshToken = false;
    if (oauth && oauth.refreshTokenTtlDays !== null) {
      if (conn.platform === 'linkedin') {
        hasUsableRefreshToken = conn.isMarketingPartner === true;
      } else if (conn.platform === 'x') {
        hasUsableRefreshToken = conn.hasOfflineAccess === true;
      } else {
        hasUsableRefreshToken = true;
      }
    }

    let refreshDaysRemaining: number | null = null;
    if (hasUsableRefreshToken && oauth && oauth.refreshTokenTtlDays !== null) {
      const refreshSource = conn.refreshTokenIssuedAt ?? conn.accessTokenIssuedAt;
      const refreshIssuedMs = Date.parse(refreshSource);
      if (!Number.isNaN(refreshIssuedMs)) {
        const refreshAgeDays = (nowMs - refreshIssuedMs) / 86_400_000;
        refreshDaysRemaining = round2(oauth.refreshTokenTtlDays - refreshAgeDays);
      }
    }

    // Determine whether programmatic auto-refresh is viable right now
    let canAutoRefresh = oauth?.supportsProgrammaticRefresh ?? false;

    if (META_PLATFORMS.has(conn.platform)) {
      // Meta uses long-lived token exchange (>24h old and NOT expired)
      canAutoRefresh =
        accessHoursRemaining !== null && accessHoursRemaining > 0;
    } else if (conn.platform === 'linkedin') {
      canAutoRefresh =
        conn.isMarketingPartner === true &&
        (refreshDaysRemaining === null || refreshDaysRemaining > 0);
    } else if (conn.platform === 'x') {
      canAutoRefresh =
        conn.hasOfflineAccess === true &&
        (refreshDaysRemaining === null || refreshDaysRemaining > 0);
    } else if (
      conn.platform === 'tiktok' ||
      conn.platform === 'bluesky'
    ) {
      canAutoRefresh =
        refreshDaysRemaining === null || refreshDaysRemaining > 0;
    } else if (conn.platform === 'mastodon') {
      canAutoRefresh = false;
    }

    // Compute baseline health status from remaining TTL
    let status: OAuthTokenHealth['status'] = 'healthy';

    if (conn.platform !== 'mastodon') {
      if (refreshDaysRemaining !== null && refreshDaysRemaining <= 0) {
        status = 'expired';
      } else if (accessHoursRemaining !== null && accessHoursRemaining <= 0) {
        status = 'expired';
      } else if (oauth && oauth.accessTokenTtlHours !== null && accessHoursRemaining !== null) {
        if (oauth.accessTokenTtlHours >= 720) {
          // 60-day tokens (Meta, LinkedIn)
          if (accessHoursRemaining <= 72) {
            status = escalateStatus(status, 'critical');
          } else if (accessHoursRemaining <= 336) {
            status = escalateStatus(status, 'expiring-soon');
          }
        } else if (oauth.accessTokenTtlHours >= 24) {
          // 24-hour tokens (TikTok)
          if (accessHoursRemaining <= 2) {
            status = escalateStatus(status, 'critical');
          } else if (accessHoursRemaining <= 6) {
            status = escalateStatus(status, 'expiring-soon');
          }
        } else {
          // Short-TTL 1-2h tokens (X, Bluesky, YouTube)
          if (accessHoursRemaining <= 0.25) {
            status = escalateStatus(status, 'critical');
          } else if (accessHoursRemaining <= 0.5) {
            status = escalateStatus(status, 'expiring-soon');
          }
        }
      }

      if (refreshDaysRemaining !== null && refreshDaysRemaining > 0) {
        if (refreshDaysRemaining <= 7) {
          status = escalateStatus(status, 'critical');
        } else if (refreshDaysRemaining <= 30) {
          status = escalateStatus(status, 'expiring-soon');
        }
      }
    }

    // Platform-specific hidden failure traps
    if (META_PLATFORMS.has(conn.platform)) {
      if (validAccessIssued && accessAgeHours < 24) {
        risks.push(
          'Meta 24-hour refresh window trap: GET /refresh_access_token is rejected until the token is at least 24 hours old; schedule automatic renewal between Day 1 and Day 55.',
        );
      }
      if (accessHoursRemaining !== null && accessHoursRemaining <= 0) {
        risks.push(
          'Meta expired token unrecoverable: Long-lived Instagram/Threads tokens cannot be refreshed after expiry — full interactive OAuth re-authorization is required.',
        );
      }
      risks.push(
        'Meta silent revocation risk: Account password changes, 2FA resets, or Page/Business Manager admin role changes silently invalidate active tokens before Day 60.',
      );
    }

    if (conn.platform === 'linkedin') {
      risks.push(
        'LinkedIn Share API resets daily member quotas (~150 requests/day) at 00:00 UTC; throttle bulk retries to avoid HTTP 429 blocks.',
      );
      if (!conn.isMarketingPartner) {
        risks.push(
          'LinkedIn non-Marketing Partner trap: Standard apps receive NO programmatic refresh token; manual browser re-authorization is required every 60 days before token expiry.',
        );
      }
      if (
        conn.isMarketingPartner &&
        conn.concurrentWorkers !== undefined &&
        conn.concurrentWorkers > 1
      ) {
        risks.push(
          `LinkedIn refresh rotation race risk with ${conn.concurrentWorkers} concurrent workers; serialize token refreshes behind a distributed single-flight lock.`,
        );
      }
    }

    if (conn.platform === 'threads') {
      risks.push(
        'Threads API enforces 250 published posts and 1,000 replies per rolling 24h window; poll GET /{user-id}/threads_publishing_limit before bursts.',
      );
    }

    if (conn.platform === 'x') {
      risks.push(
        'X API v1.1 media upload endpoints (upload.x.com) are sunset — ensure uploader pipelines use v2 /2/media/upload/initialize+APPEND+FINALIZE with media.write scope.',
      );
      if (!conn.hasOfflineAccess) {
        risks.push(
          'X 2-hour fatal death loop: Missing "offline.access" OAuth 2.0 scope prevents refresh token issuance, causing publishing to break every 2 hours.',
        );
        if (status !== 'expired') {
          status = escalateStatus(status, 'critical');
        }
      }
      if (conn.concurrentWorkers !== undefined && conn.concurrentWorkers > 1) {
        risks.push(
          `X RFC 9700 refresh token rotation race condition: ${conn.concurrentWorkers} concurrent workers refreshing simultaneously will invalidate the entire token chain. Enforce a single-flight distributed lock.`,
        );
        if (status === 'healthy') {
          status = escalateStatus(status, 'expiring-soon');
        }
      }
    }

    if (conn.platform === 'tiktok') {
      risks.push(
        'TikTok 24-hour access token expiry: Access tokens expire daily; ensure proactive background refresh runs before hour 22.',
      );
      if (conn.isAppAudited === false) {
        risks.push(
          'TikTok unaudited app trap: App is locked in SELF_ONLY private posting mode and cannot publish public videos until TikTok Developer Audit approval completes.',
        );
        if (status !== 'expired') {
          status = escalateStatus(status, 'critical');
        }
      }
      if (conn.concurrentWorkers !== undefined && conn.concurrentWorkers > 1) {
        risks.push(
          `TikTok refresh rotation race risk: ${conn.concurrentWorkers} concurrent workers require a single-flight refresh lock to avoid revoking rotated refresh tokens.`,
        );
      }
    }

    if (conn.platform === 'bluesky') {
      risks.push(
        'Bluesky video uploads require a verified email on the ATProto PDS and enforce a ~25-video / 10 GB daily ceiling.',
      );
      if (conn.concurrentWorkers !== undefined && conn.concurrentWorkers > 1) {
        risks.push(
          `Bluesky AT Protocol refresh rotation race risk: ${conn.concurrentWorkers} concurrent workers must coordinate refreshJwt rotation with a single-flight lock.`,
        );
      }
    }

    if (conn.platform === 'youtube-shorts') {
      risks.push(
        'Google OAuth Testing-mode trap: Refresh tokens expire in 7 days unless the Google Cloud OAuth consent screen is published to Production.',
      );
    }

    if (conn.platform === 'mastodon') {
      risks.push(
        'Mastodon tokens do not auto-expire unless revoked by the account holder or instance administrator; periodically probe /api/v1/accounts/verify_credentials.',
      );
    }

    // Build concrete actionRequired message
    let actionRequired: string;
    if (status === 'expired') {
      actionRequired = canAutoRefresh
        ? `Access token for ${conn.accountHandle} (${spec.shortName}) has expired; immediately execute a single-flight programmatic token refresh before the next publish job.`
        : `Token for ${conn.accountHandle} (${spec.shortName}) is expired and cannot auto-refresh; trigger immediate interactive OAuth browser re-authorization.`;
    } else if (conn.platform === 'x' && !conn.hasOfflineAccess) {
      actionRequired =
        'Re-authorize X OAuth 2.0 with the "offline.access" scope enabled to stop the 2-hour token expiry loop.';
    } else if (conn.platform === 'tiktok' && conn.isAppAudited === false) {
      actionRequired =
        'Complete TikTok Developer App Audit before scheduling public campaigns (currently restricted to SELF_ONLY).';
    } else if (status === 'critical') {
      actionRequired = canAutoRefresh
        ? `Refresh ${conn.accountHandle} (${spec.shortName}) token immediately via programmatic refresh job (and monitor refresh token expiry).`
        : `Alert account owner to manually re-authorize ${conn.accountHandle} (${spec.shortName}) in browser within 72 hours to prevent scheduled post failure.`;
    } else if (status === 'expiring-soon') {
      actionRequired = canAutoRefresh
        ? `Schedule programmatic token refresh for ${conn.accountHandle} (${spec.shortName}) soon and enforce single-flight locking if multiple workers are active.`
        : `Send proactive browser re-authorization reminder for ${conn.accountHandle} (${spec.shortName}) ahead of Day 60 expiry.`;
    } else {
      actionRequired =
        'No immediate intervention required; continue routine health monitoring and automated pre-expiry refresh checks.';
    }

    return {
      connectionId: conn.id,
      accountHandle: conn.accountHandle,
      platform: conn.platform,
      status,
      accessHoursRemaining,
      refreshDaysRemaining,
      canAutoRefresh,
      risks,
      actionRequired,
    };
  });
}
