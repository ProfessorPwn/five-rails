import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

type RouteContext = { params: Promise<{ platform: string }> };

// OAuth 2.0 configuration per platform
const oauthConfig: Record<string, {
  authUrl: string;
  scopes: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  usePKCE?: boolean;
}> = {
  twitter: {
    authUrl: "https://twitter.com/i/oauth2/authorize",
    scopes: "tweet.read tweet.write users.read offline.access",
    clientIdEnv: "TWITTER_CLIENT_ID",
    clientSecretEnv: "TWITTER_CLIENT_SECRET",
    usePKCE: true,
  },
  linkedin: {
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    scopes: "openid profile w_member_social",
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
  },
  facebook: {
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    scopes: "pages_manage_posts,pages_read_engagement,pages_show_list",
    clientIdEnv: "FACEBOOK_CLIENT_ID",
    clientSecretEnv: "FACEBOOK_CLIENT_SECRET",
  },
  instagram: {
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    scopes: "instagram_basic,instagram_content_publish,pages_show_list",
    clientIdEnv: "INSTAGRAM_CLIENT_ID",
    clientSecretEnv: "INSTAGRAM_CLIENT_SECRET",
  },
  tiktok: {
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    scopes: "user.info.basic,video.publish",
    clientIdEnv: "TIKTOK_CLIENT_ID",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
  },
  youtube: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { platform } = await context.params;
    const config = oauthConfig[platform];

    if (!config) {
      return NextResponse.json({
        error: `Unsupported platform: ${platform}. Supported: ${Object.keys(oauthConfig).join(", ")}`,
      }, { status: 400 });
    }

    const clientId = process.env[config.clientIdEnv];
    if (!clientId) {
      return NextResponse.json({
        error: `${config.clientIdEnv} environment variable is not set. Add it to your .env.local file.`,
        setup: {
          platform,
          required_env_vars: [config.clientIdEnv, config.clientSecretEnv],
          callback_url: `${getAppUrl(request)}/api/auth/${platform}/callback`,
        },
      }, { status: 503 });
    }

    const appUrl = getAppUrl(request);
    const callbackUrl = `${appUrl}/api/auth/${platform}/callback`;

    // Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString("hex");

    // Build authorization URL
    const params = new URLSearchParams();
    params.set("client_id", clientId);
    params.set("redirect_uri", callbackUrl);
    params.set("response_type", "code");
    params.set("state", state);

    if (platform === "tiktok") {
      params.set("scope", config.scopes);
      // TikTok uses client_key instead of client_id
      params.delete("client_id");
      params.set("client_key", clientId);
    } else {
      params.set("scope", config.scopes);
    }

    // PKCE for Twitter
    let codeVerifier = "";
    if (config.usePKCE) {
      codeVerifier = crypto.randomBytes(32).toString("base64url");
      const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }

    // YouTube/Google needs access_type for refresh token
    if (platform === "youtube") {
      params.set("access_type", "offline");
      params.set("prompt", "consent");
    }

    const authUrl = `${config.authUrl}?${params.toString()}`;

    // Store state and code_verifier in cookies for the callback
    const response = NextResponse.redirect(authUrl);
    response.cookies.set(`oauth_state_${platform}`, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });
    if (codeVerifier) {
      response.cookies.set(`oauth_verifier_${platform}`, codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    console.error("OAuth initiation error:", error);
    return NextResponse.json({ error: "Failed to initiate OAuth flow" }, { status: 500 });
  }
}

function getAppUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL
    || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}
