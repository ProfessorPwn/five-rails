import { NextRequest, NextResponse } from "next/server";
import { getDb, logActivity } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// System actions that the Product agent (Marty Cagan) (Ray Dalio) can perform
// These are the "admin tools" that let an agent modify the system itself

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string;
    const agentId = body.agent_id as string;

    // Only the Product agent (Marty Cagan) can perform system actions — he owns the system
    if (agentId !== "agent-product") {
      return NextResponse.json({ error: "Only the Product agent (Marty Cagan) can perform system actions. Delegate to agent-product." }, { status: 403 });
    }

    switch (action) {
      // ── Create a new skill ──────────────────────────────────────────
      case "create_skill": {
        const { name, description, category, prompt_template } = body;
        if (!name || !prompt_template) {
          return NextResponse.json({ error: "name and prompt_template are required" }, { status: 400 });
        }
        // Allow Marty to pass either "Holiday Email Writer" or "skill-holiday-email-writer".
        // Strip any leading "skill-" so we don't double-prefix.
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^skill-/, "");
        const id = `skill-${slug}`;

        // Check if exists
        const exists = getDb().prepare("SELECT id FROM skills WHERE id = ?").get(id);
        if (exists) {
          return NextResponse.json({ error: `Skill '${id}' already exists`, id });
        }

        getDb().prepare(`
          INSERT INTO skills (id, name, description, category, rail, sub_agents, prompt_template, is_active)
          VALUES (?, ?, ?, ?, 'agent_harness', '[]', ?, 1)
        `).run(id, name, description || "", category || "custom", prompt_template);

        logActivity({ action: "skill_created_by_agent", details: `Product agent (Marty Cagan) created skill: ${name} (${id})` });
        return NextResponse.json({ created: true, id, name });
      }

      // ── Update a skill ──────────────────────────────────────────────
      case "update_skill": {
        const { skill_id, updates } = body;
        if (!skill_id || !updates) return NextResponse.json({ error: "skill_id and updates required" }, { status: 400 });

        const fields: string[] = [];
        const vals: unknown[] = [];
        for (const [k, v] of Object.entries(updates as Record<string, unknown>)) {
          if (["name", "description", "category", "prompt_template", "is_active"].includes(k)) {
            fields.push(`${k} = ?`);
            vals.push(v);
          }
        }
        if (fields.length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
        vals.push(skill_id);
        getDb().prepare(`UPDATE skills SET ${fields.join(", ")} WHERE id = ?`).run(...vals);

        logActivity({ action: "skill_updated_by_agent", details: `Product agent (Marty Cagan) updated skill: ${skill_id}` });
        return NextResponse.json({ updated: true, skill_id });
      }

      // ── Assign skill to an agent ────────────────────────────────────
      case "assign_skill": {
        const { target_agent_id, skill_id: sid } = body;
        if (!target_agent_id || !sid) return NextResponse.json({ error: "target_agent_id and skill_id required" }, { status: 400 });

        const agent = getDb().prepare("SELECT assigned_skills FROM agents WHERE id = ?").get(target_agent_id) as { assigned_skills: string } | undefined;
        if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

        const skills = JSON.parse(agent.assigned_skills || "[]") as string[];
        if (!skills.includes(sid)) {
          skills.push(sid);
          getDb().prepare("UPDATE agents SET assigned_skills = ? WHERE id = ?").run(JSON.stringify(skills), target_agent_id);
        }

        logActivity({ action: "skill_assigned_by_agent", details: `Executive assigned ${sid} to ${target_agent_id}` });
        return NextResponse.json({ assigned: true, target_agent_id, skill_id: sid, total_skills: skills.length });
      }

      // ── Update agent config ─────────────────────────────────────────
      case "update_agent": {
        const { target_agent_id: taid, updates: agentUpdates } = body;
        if (!taid || !agentUpdates) return NextResponse.json({ error: "target_agent_id and updates required" }, { status: 400 });

        const fields: string[] = [];
        const vals: unknown[] = [];
        for (const [k, v] of Object.entries(agentUpdates as Record<string, unknown>)) {
          if (["name", "role", "system_prompt", "schedule", "is_active", "memory"].includes(k)) {
            fields.push(`${k} = ?`);
            vals.push(typeof v === "object" ? JSON.stringify(v) : v);
          }
        }
        if (fields.length === 0) return NextResponse.json({ error: "No valid fields" }, { status: 400 });
        vals.push(taid);
        getDb().prepare(`UPDATE agents SET ${fields.join(", ")} WHERE id = ?`).run(...vals);

        logActivity({ action: "agent_updated_by_agent", details: `Executive updated agent: ${taid}` });
        return NextResponse.json({ updated: true, target_agent_id: taid });
      }

      // ── Update automation settings ──────────────────────────────────
      case "update_setting": {
        const { key, value } = body;
        if (!key || value === undefined) return NextResponse.json({ error: "key and value required" }, { status: 400 });

        getDb().prepare("INSERT OR REPLACE INTO automation_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, String(value));

        logActivity({ action: "setting_updated_by_agent", details: `Executive updated setting: ${key} = ${value}` });
        return NextResponse.json({ updated: true, key, value });
      }

      // ── Clear stuck messages ────────────────────────────────────────
      case "clear_messages": {
        const { target_agent_id: clearTarget, mark_read } = body;
        if (mark_read) {
          const count = getDb().prepare(
            "UPDATE agent_messages SET is_read = 1 WHERE to_agent_id = ? AND is_read = 0"
          ).run(clearTarget || "agent-executive").changes;
          return NextResponse.json({ cleared: count });
        }
        return NextResponse.json({ error: "Use mark_read: true" }, { status: 400 });
      }

      // ── Add MCP tool ────────────────────────────────────────────────
      case "add_mcp_tool": {
        const { name: toolName, description: toolDesc, category: toolCat, connection_type } = body;
        if (!toolName) return NextResponse.json({ error: "name required" }, { status: 400 });

        const toolId = `mcp-${toolName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        const exists = getDb().prepare("SELECT id FROM mcp_tools WHERE id = ?").get(toolId);
        if (exists) return NextResponse.json({ error: `Tool '${toolId}' already exists`, id: toolId });

        getDb().prepare(`
          INSERT INTO mcp_tools (id, name, description, category, connection_type)
          VALUES (?, ?, ?, ?, ?)
        `).run(toolId, toolName, toolDesc || "", toolCat || "custom", connection_type || "api_key");

        logActivity({ action: "mcp_tool_created_by_agent", details: `Executive created MCP tool: ${toolName}` });
        return NextResponse.json({ created: true, id: toolId, name: toolName });
      }

      // ── List available actions ──────────────────────────────────────
      case "list_actions": {
        return NextResponse.json({
          available_actions: [
            { action: "create_skill", params: "name, description, category, prompt_template", desc: "Create a new skill" },
            { action: "update_skill", params: "skill_id, updates: {name, description, prompt_template, is_active}", desc: "Update existing skill" },
            { action: "assign_skill", params: "target_agent_id, skill_id", desc: "Assign a skill to an agent" },
            { action: "update_agent", params: "target_agent_id, updates: {name, role, system_prompt, schedule, is_active}", desc: "Update agent config" },
            { action: "update_setting", params: "key, value", desc: "Update automation setting" },
            { action: "clear_messages", params: "target_agent_id, mark_read: true", desc: "Mark messages as read" },
            { action: "add_mcp_tool", params: "name, description, category, connection_type", desc: "Add a new MCP tool" },
          ],
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}. Use 'list_actions' to see available.` }, { status: 400 });
    }
  } catch (error) {
    console.error("POST /api/agents/system-action error:", error);
    return NextResponse.json({ error: "System action failed" }, { status: 500 });
  }
}
