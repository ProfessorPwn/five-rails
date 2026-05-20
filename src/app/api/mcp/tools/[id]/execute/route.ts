import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

type RouteContext = { params: Promise<{ id: string }> };

interface MCPTool {
  id: string;
  name: string;
  description: string;
  category: string;
  connection_type: string;
  config: string;
  is_connected: number;
  platform_connection_id: string | null;
}

interface PlatformConnection {
  id: string;
  platform: string;
  api_key: string | null;
  api_secret: string | null;
  access_token: string | null;
  access_token_secret: string | null;
  refresh_token: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  from_email: string | null;
}

// ── Tool Executor Registry ──────────────────────────────────────────────────

type ToolExecutor = (
  action: string,
  params: Record<string, unknown>,
  credentials: { config: Record<string, unknown>; platformConn: PlatformConnection | null }
) => Promise<{ status: string; result: unknown }>;

const toolExecutors: Record<string, ToolExecutor> = {
  "mcp-resend": executeResend,
  "mcp-slack": executeSlack,
  "mcp-notion": executeNotion,
  "mcp-stripe": executeStripe,
  "mcp-gmail": executeGmail,
  "mcp-twitter": executeTwitter,
  "mcp-linkedin": executeLinkedIn,
  "mcp-facebook": executeFacebook,
  "mcp-calendar": executeCalendar,
  "mcp-drive": executeDrive,
  "mcp-analytics": executeAnalytics,
};

// ── Main Route ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { action, params } = body as { action: string; params: Record<string, unknown> };

    if (!action) {
      return NextResponse.json({ error: "Missing 'action' field" }, { status: 400 });
    }

    // Fetch the MCP tool
    const tool = getDb().prepare("SELECT * FROM mcp_tools WHERE id = ?").get(id) as MCPTool | undefined;
    if (!tool) {
      return NextResponse.json({ error: "MCP tool not found" }, { status: 404 });
    }

    // Check if tool is connected
    if (!tool.is_connected) {
      logToolExecution(tool.name, action, false, "Tool not connected");
      return NextResponse.json({
        error: "Tool not connected",
        hint: `Connect ${tool.name} in Settings → Connections`,
      }, { status: 400 });
    }

    // Fetch platform connection credentials if linked
    let platformConn: PlatformConnection | null = null;
    if (tool.platform_connection_id) {
      platformConn = getDb().prepare("SELECT * FROM platform_connections WHERE id = ?")
        .get(tool.platform_connection_id) as PlatformConnection | null;
    }

    // Parse tool config
    const config = safeJsonParse(tool.config);

    // Get the executor for this tool
    const executor = toolExecutors[tool.id];
    if (!executor) {
      logToolExecution(tool.name, action, false, "No executor registered");
      return NextResponse.json({
        error: "No executor registered for this tool",
        hint: `Tool '${tool.name}' execution is not yet implemented`,
      }, { status: 501 });
    }

    // Execute the tool action
    const result = await executor(action, params || {}, { config, platformConn });

    // Log successful execution
    logToolExecution(tool.name, action, true, JSON.stringify(result).slice(0, 500));

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/mcp/tools/[id]/execute error:", error);
    return NextResponse.json(
      { error: "Tool execution failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ── Tool Implementations ────────────────────────────────────────────────────

async function executeResend(
  action: string,
  params: Record<string, unknown>,
  creds: { config: Record<string, unknown>; platformConn: PlatformConnection | null }
): Promise<{ status: string; result: unknown }> {
  const apiKey = (creds.config.api_key as string) || creds.platformConn?.api_key;
  if (!apiKey) {
    return { status: "error", result: "No API key configured for Resend. Set api_key in tool config." };
  }

  switch (action) {
    case "send_email": {
      const { to, subject, html, from } = params as { to: string; subject: string; html: string; from?: string };
      if (!to || !subject || !html) {
        return { status: "error", result: "Missing required params: to, subject, html" };
      }

      const fromAddress = (from as string) || (creds.config.from_email as string) || "Five Rails <noreply@fiverails.app>";

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromAddress, to: Array.isArray(to) ? to : [to], subject, html }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data };
      }
      return { status: "sent", result: { id: data.id, to, subject } };
    }
    default:
      return { status: "error", result: `Unknown Resend action: '${action}'. Supported: send_email` };
  }
}

async function executeSlack(
  action: string,
  params: Record<string, unknown>,
  creds: { config: Record<string, unknown>; platformConn: PlatformConnection | null }
): Promise<{ status: string; result: unknown }> {
  const token = (creds.config.access_token as string) || (creds.config.bot_token as string) || creds.platformConn?.access_token;
  if (!token) {
    return { status: "error", result: "No access token configured for Slack. Set access_token or bot_token in tool config." };
  }

  switch (action) {
    case "send_message": {
      const { channel, text } = params as { channel: string; text: string };
      if (!channel || !text) {
        return { status: "error", result: "Missing required params: channel, text" };
      }

      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel, text }),
      });

      const data = await res.json();
      if (!data.ok) {
        return { status: "error", result: `Slack error: ${data.error}` };
      }
      return { status: "sent", result: { channel: data.channel, ts: data.ts, message: text.slice(0, 100) } };
    }
    case "list_channels": {
      const res = await fetch("https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) {
        return { status: "error", result: `Slack error: ${data.error}` };
      }
      const channels = (data.channels || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
      return { status: "ok", result: channels };
    }
    default:
      return { status: "error", result: `Unknown Slack action: '${action}'. Supported: send_message, list_channels` };
  }
}

async function executeNotion(
  action: string,
  params: Record<string, unknown>,
  creds: { config: Record<string, unknown>; platformConn: PlatformConnection | null }
): Promise<{ status: string; result: unknown }> {
  const apiKey = (creds.config.api_key as string) || (creds.config.integration_token as string) || creds.platformConn?.api_key;
  if (!apiKey) {
    return { status: "error", result: "No API key configured for Notion. Set api_key in tool config." };
  }

  const notionHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  };

  switch (action) {
    case "create_page": {
      const { database_id, properties, content } = params as {
        database_id: string;
        properties: Record<string, unknown>;
        content?: string;
      };
      if (!database_id) {
        return { status: "error", result: "Missing required param: database_id" };
      }

      const body: Record<string, unknown> = {
        parent: { database_id },
        properties: properties || {},
      };

      // Add content blocks if provided
      if (content) {
        body.children = [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content } }],
            },
          },
        ];
      }

      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: notionHeaders,
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data };
      }
      return { status: "created", result: { id: data.id, url: data.url } };
    }
    case "search": {
      const { query } = params as { query: string };
      const res = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: notionHeaders,
        body: JSON.stringify({ query: query || "", page_size: 10 }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data };
      }
      return { status: "ok", result: data.results?.map((r: { id: string; object: string; url: string }) => ({ id: r.id, type: r.object, url: r.url })) || [] };
    }
    default:
      return { status: "error", result: `Unknown Notion action: '${action}'. Supported: create_page, search` };
  }
}

async function executeStripe(
  action: string,
  params: Record<string, unknown>,
  creds: { config: Record<string, unknown>; platformConn: PlatformConnection | null }
): Promise<{ status: string; result: unknown }> {
  const apiKey = (creds.config.api_key as string) || (creds.config.secret_key as string) || creds.platformConn?.api_key;
  if (!apiKey) {
    return { status: "error", result: "No API key configured for Stripe. Set api_key in tool config." };
  }

  const stripeHeaders = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  switch (action) {
    case "list_customers": {
      const limit = (params.limit as number) || 10;
      const res = await fetch(`https://api.stripe.com/v1/customers?limit=${limit}`, {
        headers: stripeHeaders,
      });
      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.error?.message || data };
      }
      return {
        status: "ok",
        result: data.data?.map((c: { id: string; email: string; name: string; created: number }) => ({
          id: c.id, email: c.email, name: c.name, created: c.created,
        })) || [],
      };
    }
    case "list_subscriptions": {
      const limit = (params.limit as number) || 10;
      const status = (params.status as string) || "active";
      const res = await fetch(`https://api.stripe.com/v1/subscriptions?limit=${limit}&status=${status}`, {
        headers: stripeHeaders,
      });
      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.error?.message || data };
      }
      return {
        status: "ok",
        result: data.data?.map((s: { id: string; status: string; current_period_end: number; customer: string }) => ({
          id: s.id, status: s.status, customer: s.customer, current_period_end: s.current_period_end,
        })) || [],
      };
    }
    case "create_customer": {
      const { email, name, metadata } = params as { email: string; name?: string; metadata?: Record<string, string> };
      if (!email) {
        return { status: "error", result: "Missing required param: email" };
      }
      const bodyParts = [`email=${encodeURIComponent(email)}`];
      if (name) bodyParts.push(`name=${encodeURIComponent(name)}`);
      if (metadata) {
        for (const [k, v] of Object.entries(metadata)) {
          bodyParts.push(`metadata[${encodeURIComponent(k)}]=${encodeURIComponent(v)}`);
        }
      }
      const res = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: stripeHeaders,
        body: bodyParts.join("&"),
      });
      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.error?.message || data };
      }
      return { status: "created", result: { id: data.id, email: data.email, name: data.name } };
    }
    default:
      return { status: "error", result: `Unknown Stripe action: '${action}'. Supported: list_customers, list_subscriptions, create_customer` };
  }
}

async function executeGmail(
  action: string,
  params: Record<string, unknown>,
  creds: { config: Record<string, unknown>; platformConn: PlatformConnection | null }
): Promise<{ status: string; result: unknown }> {
  const accessToken = (creds.config.access_token as string) || creds.platformConn?.access_token;
  if (!accessToken) {
    return { status: "error", result: "No access token configured for Gmail. Set access_token in tool config or link a platform connection." };
  }

  switch (action) {
    case "send_email": {
      const { to, subject, body: emailBody, cc, bcc } = params as {
        to: string; subject: string; body: string; cc?: string; bcc?: string;
      };
      if (!to || !subject || !emailBody) {
        return { status: "error", result: "Missing required params: to, subject, body" };
      }

      // Build RFC 2822 email
      const emailLines = [
        `To: ${to}`,
        ...(cc ? [`Cc: ${cc}`] : []),
        ...(bcc ? [`Bcc: ${bcc}`] : []),
        `Subject: ${subject}`,
        "Content-Type: text/html; charset=utf-8",
        "",
        emailBody,
      ];
      const rawEmail = emailLines.join("\r\n");
      // Base64url encode
      const encoded = Buffer.from(rawEmail).toString("base64url");

      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: encoded }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.error?.message || data };
      }
      return { status: "sent", result: { id: data.id, threadId: data.threadId, to, subject } };
    }
    case "list_messages": {
      const maxResults = (params.max_results as number) || 10;
      const q = (params.query as string) || "";
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.error?.message || data };
      }
      return { status: "ok", result: { messages: data.messages || [], resultSizeEstimate: data.resultSizeEstimate } };
    }
    default:
      return { status: "error", result: `Unknown Gmail action: '${action}'. Supported: send_email, list_messages` };
  }
}

async function executeTwitter(
  action: string,
  params: Record<string, unknown>,
  creds: { config: Record<string, unknown>; platformConn: PlatformConnection | null }
): Promise<{ status: string; result: unknown }> {
  const accessToken = (creds.config.access_token as string) || creds.platformConn?.access_token;
  if (!accessToken) {
    return { status: "error", result: "No access token configured for Twitter. Set access_token in tool config or link a platform connection." };
  }

  switch (action) {
    case "post_tweet": {
      const { text } = params as { text: string };
      if (!text) {
        return { status: "error", result: "Missing required param: text" };
      }

      const res = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.detail || data.errors || data };
      }
      return { status: "posted", result: { id: data.data?.id, text: text.slice(0, 100) } };
    }
    case "get_mentions": {
      const userId = (params.user_id as string) || (creds.config.user_id as string);
      if (!userId) {
        return { status: "error", result: "Missing user_id param or config. Set user_id in tool config." };
      }
      const res = await fetch(`https://api.twitter.com/2/users/${userId}/mentions?max_results=10`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.detail || data.errors || data };
      }
      return { status: "ok", result: data.data || [] };
    }
    default:
      return { status: "error", result: `Unknown Twitter action: '${action}'. Supported: post_tweet, get_mentions` };
  }
}

// ── Stub Implementations (return descriptive responses) ─────────────────────

async function executeLinkedIn(
  action: string,
  params: Record<string, unknown>,
  creds: { config: Record<string, unknown>; platformConn: PlatformConnection | null }
): Promise<{ status: string; result: unknown }> {
  const accessToken = (creds.config.access_token as string) || creds.platformConn?.access_token;
  if (!accessToken) {
    return { status: "error", result: "No access token configured for LinkedIn." };
  }

  switch (action) {
    case "create_post": {
      const { text } = params as { text: string };
      if (!text) return { status: "error", result: "Missing required param: text" };

      const authorId = (creds.config.author_id as string) || (params.author_id as string);
      if (!authorId) return { status: "error", result: "Missing author_id in config or params. Set your LinkedIn URN (e.g., urn:li:person:xxxxx)." };

      const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: authorId,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: { text },
              shareMediaCategory: "NONE",
            },
          },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.message || data };
      }
      return { status: "posted", result: { id: data.id, text: text.slice(0, 100) } };
    }
    default:
      return { status: "error", result: `Unknown LinkedIn action: '${action}'. Supported: create_post` };
  }
}

async function executeFacebook(
  action: string,
  params: Record<string, unknown>,
  creds: { config: Record<string, unknown>; platformConn: PlatformConnection | null }
): Promise<{ status: string; result: unknown }> {
  const accessToken = (creds.config.access_token as string) || creds.platformConn?.access_token;
  if (!accessToken) {
    return { status: "error", result: "No access token configured for Facebook." };
  }

  switch (action) {
    case "create_post": {
      const { message, page_id } = params as { message: string; page_id?: string };
      if (!message) return { status: "error", result: "Missing required param: message" };
      const targetPage = page_id || (creds.config.page_id as string);
      if (!targetPage) return { status: "error", result: "Missing page_id param or config." };

      const res = await fetch(`https://graph.facebook.com/v18.0/${targetPage}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, access_token: accessToken }),
      });

      const data = await res.json();
      if (data.error) {
        return { status: "error", result: data.error.message || data.error };
      }
      return { status: "posted", result: { id: data.id, message: message.slice(0, 100) } };
    }
    default:
      return { status: "error", result: `Unknown Facebook action: '${action}'. Supported: create_post` };
  }
}

async function executeCalendar(
  action: string,
  params: Record<string, unknown>,
  creds: { config: Record<string, unknown>; platformConn: PlatformConnection | null }
): Promise<{ status: string; result: unknown }> {
  const accessToken = (creds.config.access_token as string) || creds.platformConn?.access_token;
  if (!accessToken) {
    return { status: "error", result: "No access token configured for Google Calendar." };
  }

  switch (action) {
    case "create_event": {
      const { summary, start, end, description, attendees } = params as {
        summary: string; start: string; end: string; description?: string; attendees?: string[];
      };
      if (!summary || !start || !end) {
        return { status: "error", result: "Missing required params: summary, start, end" };
      }

      const calendarId = (creds.config.calendar_id as string) || "primary";
      const eventBody: Record<string, unknown> = {
        summary,
        description: description || "",
        start: { dateTime: start, timeZone: (creds.config.timezone as string) || "UTC" },
        end: { dateTime: end, timeZone: (creds.config.timezone as string) || "UTC" },
      };
      if (attendees && attendees.length > 0) {
        eventBody.attendees = attendees.map((email: string) => ({ email }));
      }

      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody),
      });

      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.error?.message || data };
      }
      return { status: "created", result: { id: data.id, htmlLink: data.htmlLink, summary } };
    }
    case "list_events": {
      const calendarId = (creds.config.calendar_id as string) || "primary";
      const timeMin = (params.time_min as string) || new Date().toISOString();
      const maxResults = (params.max_results as number) || 10;

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=${maxResults}&orderBy=startTime&singleEvents=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.error?.message || data };
      }
      return {
        status: "ok",
        result: (data.items || []).map((e: { id: string; summary: string; start: { dateTime?: string; date?: string } }) => ({
          id: e.id, summary: e.summary, start: e.start?.dateTime || e.start?.date,
        })),
      };
    }
    default:
      return { status: "error", result: `Unknown Calendar action: '${action}'. Supported: create_event, list_events` };
  }
}

async function executeDrive(
  action: string,
  params: Record<string, unknown>,
  creds: { config: Record<string, unknown>; platformConn: PlatformConnection | null }
): Promise<{ status: string; result: unknown }> {
  const accessToken = (creds.config.access_token as string) || creds.platformConn?.access_token;
  if (!accessToken) {
    return { status: "error", result: "No access token configured for Google Drive." };
  }

  switch (action) {
    case "list_files": {
      const query = (params.query as string) || "";
      const pageSize = (params.page_size as number) || 10;
      const url = `https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}&fields=files(id,name,mimeType,modifiedTime)${query ? `&q=${encodeURIComponent(query)}` : ""}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.error?.message || data };
      }
      return { status: "ok", result: data.files || [] };
    }
    case "create_file": {
      const { name, content, mime_type, folder_id } = params as {
        name: string; content: string; mime_type?: string; folder_id?: string;
      };
      if (!name || !content) {
        return { status: "error", result: "Missing required params: name, content" };
      }

      // Use multipart upload
      const metadata: Record<string, unknown> = { name, mimeType: mime_type || "text/plain" };
      if (folder_id) metadata.parents = [folder_id];

      const boundary = "fiverails_boundary";
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        `Content-Type: ${mime_type || "text/plain"}`,
        "",
        content,
        `--${boundary}--`,
      ].join("\r\n");

      const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.error?.message || data };
      }
      return { status: "created", result: { id: data.id, name: data.name } };
    }
    default:
      return { status: "error", result: `Unknown Drive action: '${action}'. Supported: list_files, create_file` };
  }
}

async function executeAnalytics(
  action: string,
  params: Record<string, unknown>,
  creds: { config: Record<string, unknown>; platformConn: PlatformConnection | null }
): Promise<{ status: string; result: unknown }> {
  const accessToken = (creds.config.access_token as string) || creds.platformConn?.access_token;
  if (!accessToken) {
    return { status: "error", result: "No access token configured for Google Analytics." };
  }

  const propertyId = (params.property_id as string) || (creds.config.property_id as string);
  if (!propertyId) {
    return { status: "error", result: "Missing property_id param or config. Set your GA4 property ID." };
  }

  switch (action) {
    case "get_report": {
      const startDate = (params.start_date as string) || "30daysAgo";
      const endDate = (params.end_date as string) || "today";
      const metrics = (params.metrics as string[]) || ["sessions", "totalUsers", "screenPageViews"];

      const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          metrics: metrics.map((m: string) => ({ name: m })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { status: "error", result: data.error?.message || data };
      }
      return { status: "ok", result: data };
    }
    default:
      return { status: "error", result: `Unknown Analytics action: '${action}'. Supported: get_report` };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function safeJsonParse(str: string | null | undefined): Record<string, unknown> {
  try {
    return JSON.parse(str || "{}");
  } catch {
    return {};
  }
}

function logToolExecution(toolName: string, action: string, success: boolean, details: string) {
  try {
    const id = uuidv4();
    getDb().prepare(
      "INSERT INTO activity_log (id, action, details) VALUES (?, ?, ?)"
    ).run(id, "mcp_tool_used", `${toolName}: ${action} (${success ? "success" : "failed"}) — ${details.slice(0, 300)}`);
  } catch (err) {
    console.error("Failed to log MCP tool execution:", err);
  }
}
