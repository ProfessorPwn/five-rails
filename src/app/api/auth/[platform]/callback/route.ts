import { NextRequest, NextResponse } from "next/server";
import {
  createPlatformConnection,
  getPlatformConnections,
  updatePlatformConnection,
  logActivity,
} from "@/lib/db";

type RouteContext = { params: Promise<{ platform: string }> };

// Token endpoints per platform
const tokenConfig: Record<string, {
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  usePKCE?: boolean;
  useBasicAuth?: boolean;
}> = {
  twitter: {
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    clientIdEnv: "TWITTER_CLIENT_ID",
    clientSecretEnv: "TWITTER_CLIENT_SECRET",
    usePKCE: true,
    useBasicAuth: true,
  },
  linkedin: {
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
  },
  facebook: {
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    clientIdEnv: "FACEBOOK_CLIENT_ID",
    clientSecretEnv: "FACEBOOK_CLIENT_SECRET",
  },
  instagram: {
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    clientIdEnv: "INSTAGRAM_CLIENT_ID",
    clientSecretEnv: "INSTAGRAM_CLIENT_SECRET",
  },
  tiktok: {
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    clientIdEnv: "TIKTOK_CLIENT_ID",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
  },
  youtube: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { platform } = await context.params;
  const config = tokenConfig[platform];
  const appUrl = getAppUrl(request);

  if (!config) {
    return redirectWithError(appUrl, `Unsupported platform: ${platform}`);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    const desc = searchParams.get("error_description") || error;
    return redirectWithError(appUrl, `${platform} authorization denied: ${desc}`);
  }

  if (!code) {
    return redirectWithError(appUrl, "No authorization code received");
  }

  // Verify state
  const storedState = request.cookies.get(`oauth_state_${platform}`)?.value;
  if (!storedState || storedState !== state) {
    return redirectWithError(appUrl, "OAuth state mismatch — possible CSRF attack");
  }

  const clientId = process.env[config.clientIdEnv] || "";
  const clientSecret = process.env[config.clientSecretEnv] || "";
  const callbackUrl = `${appUrl}/api/auth/${platform}/callback`;
  const codeVerifier = request.cookies.get(`oauth_verifier_${platform}`)?.value;

  try {
    // Exchange authorization code for tokens
    const tokenData = await exchangeCode(platform, config, code, callbackUrl, clientId, clientSecret, codeVerifier);

    if (tokenData.error) {
      return redirectWithError(appUrl, `Token exchange failed: ${tokenData.error}`);
    }

    // Fetch user profile
    const profile = await fetchProfile(platform, tokenData.access_token);

    // Calculate token expiry
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Check if a connection for this platform already exists — update it instead of creating duplicate
    const existing = getPlatformConnections().find(
      (c) => c.platform === platform && c.is_active
    );

    if (existing) {
      updatePlatformConnection(existing.id, {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || undefined,
        token_expires_at: expiresAt || undefined,
        account_id: profile.id || undefined,
        username: profile.username || undefined,
        profile_image: profile.profile_image || undefined,
        label: profile.username || profile.name || undefined,
      });
    } else {
      createPlatformConnection({
        platform: platform as any,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || undefined,
        token_expires_at: expiresAt || undefined,
        account_id: profile.id || undefined,
        username: profile.username || undefined,
        profile_image: profile.profile_image || undefined,
        label: profile.username || profile.name || platform,
        is_active: true,
      });
    }

    logActivity({
      action: "platform_connected",
      details: `Connected ${platform} account: ${profile.username || profile.name || "unknown"}`,
    });

    // Clear OAuth cookies and redirect to connections page
    const response = NextResponse.redirect(`${appUrl}/connections?connected=${platform}`);
    response.cookies.delete(`oauth_state_${platform}`);
    response.cookies.delete(`oauth_verifier_${platform}`);
    return response;
  } catch (err) {
    console.error(`OAuth callback error for ${platform}:`, err);
    return redirectWithError(appUrl, `Failed to complete ${platform} authorization`);
  }
}

async function exchangeCode(
  platform: string,
  config: typeof tokenConfig[string],
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  codeVerifier?: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number; error?: string }> {
  const body = new URLSearchParams();
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("grant_type", "authorization_code");

  if (platform === "tiktok") {
    body.set("client_key", clientId);
    body.set("client_secret", clientSecret);
  } else if (!config.useBasicAuth) {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }

  if (config.usePKCE && codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (config.useBasicAuth) {
    headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    return { access_token: "", error: data.error_description || data.error || `HTTP ${res.status}` };
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };
}

async function fetchProfile(
  platform: string,
  accessToken: string
): Promise<{ id?: string; username?: string; name?: string; profile_image?: string }> {
  try {
    if (platform === "twitter") {
      const res = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      return {
        id: data.data?.id,
        username: data.data?.username ? `@${data.data.username}` : undefined,
        name: data.data?.name,
        profile_image: data.data?.profile_image_url,
      };
    }

    if (platform === "linkedin") {
      const res = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      return {
        id: data.sub,
        username: data.name,
        name: data.name,
        profile_image: data.picture,
      };
    }

    if (platform === "facebook") {
      // Get pages the user manages (for posting to pages)
      const res = await fetch("https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=" + accessToken);
      const data = await res.json();
      return {
        id: data.id,
        username: data.name,
        name: data.name,
        profile_image: data.picture?.data?.url,
      };
    }

    if (platform === "instagram") {
      // Instagram uses Facebook Graph API
      const res = await fetch("https://graph.facebook.com/v21.0/me?fields=id,name&access_token=" + accessToken);
      const data = await res.json();
      return {
        id: data.id,
        username: data.name,
        name: data.name,
      };
    }

    if (platform === "tiktok") {
      const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      return {
        id: data.data?.user?.open_id,
        username: data.data?.user?.display_name,
        name: data.data?.user?.display_name,
        profile_image: data.data?.user?.avatar_url,
      };
    }

    if (platform === "youtube") {
      const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      const channel = data.items?.[0];
      return {
        id: channel?.id,
        username: channel?.snippet?.title,
        name: channel?.snippet?.title,
        profile_image: channel?.snippet?.thumbnails?.default?.url,
      };
    }

    return {};
  } catch (err) {
    console.error(`Profile fetch error for ${platform}:`, err);
    return {};
  }
}

function getAppUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL
    || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

function redirectWithError(appUrl: string, error: string): NextResponse {
  return NextResponse.redirect(
    `${appUrl}/connections?error=${encodeURIComponent(error)}`
  );
}
