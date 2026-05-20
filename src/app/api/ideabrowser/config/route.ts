import { NextRequest, NextResponse } from "next/server";
import {
  getIdeaBrowserConfig,
  setIdeaBrowserConfig,
  logActivity,
} from "@/lib/db";
import { safeParseJson } from "@/lib/validation";

const ALLOWED_CONFIG_KEYS = new Set(["sync_enabled", "auto_sync_interval"]);

export async function GET() {
  try {
    const config = getIdeaBrowserConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error("GET /api/ideabrowser/config error:", error);
    return NextResponse.json(
      { error: "Failed to fetch IdeaBrowser config" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await safeParseJson(request);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid or missing JSON body" },
        { status: 400 }
      );
    }

    const updated: Record<string, string> = {};
    const rejected: string[] = [];

    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_CONFIG_KEYS.has(key)) {
        rejected.push(key);
        continue;
      }

      // Validate specific keys
      if (key === "sync_enabled") {
        const val = String(value).toLowerCase();
        if (val !== "true" && val !== "false") {
          return NextResponse.json(
            { error: "sync_enabled must be 'true' or 'false'" },
            { status: 400 }
          );
        }
        setIdeaBrowserConfig(key, val);
        updated[key] = val;
      } else if (key === "auto_sync_interval") {
        const interval = Number(value);
        if (isNaN(interval) || interval < 0) {
          return NextResponse.json(
            { error: "auto_sync_interval must be a non-negative number (minutes)" },
            { status: 400 }
          );
        }
        const val = String(interval);
        setIdeaBrowserConfig(key, val);
        updated[key] = val;
      }
    }

    if (Object.keys(updated).length === 0 && rejected.length > 0) {
      return NextResponse.json(
        {
          error: `No valid config keys provided. Allowed keys: ${Array.from(ALLOWED_CONFIG_KEYS).join(", ")}`,
          rejected,
        },
        { status: 400 }
      );
    }

    logActivity({
      action: "ideabrowser_config_updated",
      details: `Updated IdeaBrowser config: ${Object.entries(updated).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    });

    // Return full config after update
    const config = getIdeaBrowserConfig();
    return NextResponse.json({
      config,
      updated,
      ...(rejected.length > 0 ? { rejected_keys: rejected } : {}),
    });
  } catch (error) {
    console.error("PATCH /api/ideabrowser/config error:", error);
    return NextResponse.json(
      { error: "Failed to update IdeaBrowser config" },
      { status: 500 }
    );
  }
}
