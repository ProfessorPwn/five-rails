import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// GET: Auto-detect Claude OAuth token from local credentials
export async function GET() {
  try {
    const home = homedir();
    const paths = [
      join(home, ".claude", ".credentials.json"),
      join(home, ".claude", "credentials.json"),
      join(home, ".config", "claude", "credentials.json"),
    ];

    for (const credPath of paths) {
      if (existsSync(credPath)) {
        try {
          const content = readFileSync(credPath, "utf-8");
          const creds = JSON.parse(content);
          const oauth = creds.claudeAiOauth || creds;
          const token = oauth.accessToken || oauth.oauth_token || oauth.token;

          if (token) {
            return NextResponse.json({
              token,
              masked: token.slice(0, 12) + "..." + token.slice(-4),
              source: credPath,
              expiresAt: oauth.expiresAt ? new Date(oauth.expiresAt).toISOString() : null,
              scopes: oauth.scopes || [],
              subscriptionType: oauth.subscriptionType || null,
            });
          }
        } catch { continue; }
      }
    }

    // Check environment
    const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
    if (envToken) {
      return NextResponse.json({
        token: envToken,
        masked: envToken.slice(0, 12) + "..." + envToken.slice(-4),
        source: "environment variable",
      });
    }

    return NextResponse.json({
      error: "No Claude credentials found",
      hint: "Run 'claude auth login' in your terminal first.",
    }, { status: 404 });
  } catch (error) {
    console.error("GET /api/auth/claude-token error:", error);
    return NextResponse.json({ error: "Failed to detect token" }, { status: 500 });
  }
}

// POST: Run 'claude auth login' via the SDK to initiate OAuth flow
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Action: login — trigger the Claude auth flow
    if (body.action === "login") {
      const { execSync } = await import("child_process");
      try {
        // Try to run claude auth login non-interactively
        // This opens a browser for OAuth
        execSync("claude auth login --no-interactive 2>&1 || true", {
          timeout: 5000,
          encoding: "utf-8",
          env: { ...process.env, HOME: homedir() },
        });
      } catch {
        // The login command may open a browser — that's expected
      }

      return NextResponse.json({
        message: "OAuth flow initiated. Check your browser to complete login.",
        hint: "After logging in via browser, click 'Auto-detect' to grab the token.",
      });
    }

    // Action: save — save the detected token as a connection
    if (body.action === "save") {
      const { getDb } = await import("@/lib/db");
      const { v4: uuidv4 } = await import("uuid");

      // Read the token
      const home = homedir();
      const credPath = join(home, ".claude", ".credentials.json");
      if (!existsSync(credPath)) {
        return NextResponse.json({ error: "No credentials file found. Login first." }, { status: 404 });
      }

      const creds = JSON.parse(readFileSync(credPath, "utf-8"));
      const oauth = creds.claudeAiOauth || creds;
      const token = oauth.accessToken || oauth.token;

      if (!token) {
        return NextResponse.json({ error: "No token found in credentials. Login first." }, { status: 404 });
      }

      // Check if anthropic connection already exists
      const existing = getDb().prepare("SELECT id FROM connections WHERE provider = 'anthropic'").get() as { id: string } | undefined;

      if (existing) {
        // Update existing
        getDb().prepare("UPDATE connections SET api_key_encrypted = ?, model = ?, is_active = 1 WHERE id = ?")
          .run(token, body.model || "claude-sonnet-4-20250514", existing.id);
        return NextResponse.json({ updated: true, id: existing.id });
      } else {
        // Create new
        const id = uuidv4();
        getDb().prepare(
          "INSERT INTO connections (id, provider, api_key_encrypted, base_url, model, is_active) VALUES (?, 'anthropic', ?, 'https://api.anthropic.com', ?, 1)"
        ).run(id, token, body.model || "claude-sonnet-4-20250514");
        return NextResponse.json({ created: true, id });
      }
    }

    return NextResponse.json({ error: "Use action: 'login' or 'save'" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/auth/claude-token error:", error);
    return NextResponse.json({ error: "Failed to process auth request" }, { status: 500 });
  }
}
