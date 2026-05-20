import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET — Export contacts as CSV
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("project_id");

    const query = projectId
      ? "SELECT name, email, company, role, status, lead_score, tags, notes, created_at FROM outbound_contacts WHERE project_id = ? ORDER BY created_at DESC"
      : "SELECT name, email, company, role, status, lead_score, tags, notes, created_at FROM outbound_contacts ORDER BY created_at DESC";

    const contacts = projectId
      ? getDb().prepare(query).all(projectId)
      : getDb().prepare(query).all();

    const headers = ["name", "email", "company", "role", "status", "lead_score", "tags", "notes", "created_at"];
    const csvRows = [headers.join(",")];

    for (const contact of contacts as Record<string, unknown>[]) {
      const row = headers.map(h => {
        const val = contact[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvRows.push(row.join(","));
    }

    const csv = csvRows.join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("GET /api/outbound/export error:", error);
    return NextResponse.json({ error: "Failed to export contacts" }, { status: 500 });
  }
}
