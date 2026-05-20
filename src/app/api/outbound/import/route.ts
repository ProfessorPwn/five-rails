import { NextRequest, NextResponse } from "next/server";
import { createContact, logActivity, getDb } from "@/lib/db";
import { isValidEmail } from "@/lib/validation";

// POST — Import contacts from CSV text
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { csv, project_id } = body;

    if (!csv || typeof csv !== "string") {
      return NextResponse.json({ error: "csv field is required (string)" }, { status: 400 });
    }

    const lines = csv.trim().split("\n");
    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });
    }

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
    const nameIdx = headers.findIndex(h => h === "name" || h === "full_name" || h === "fullname");
    const emailIdx = headers.findIndex(h => h === "email" || h === "email_address");
    const companyIdx = headers.findIndex(h => h === "company" || h === "organization" || h === "org");
    const roleIdx = headers.findIndex(h => h === "role" || h === "title" || h === "job_title" || h === "position");
    const notesIdx = headers.findIndex(h => h === "notes" || h === "note");
    const tagsIdx = headers.findIndex(h => h === "tags" || h === "tag");

    if (nameIdx === -1 && emailIdx === -1) {
      return NextResponse.json({ error: "CSV must have a 'name' or 'email' column" }, { status: 400 });
    }

    const imported: string[] = [];
    const skipped: { line: number; reason: string }[] = [];
    const existingEmails = new Set<string>();

    // Pre-fetch existing emails to avoid duplicates
    const existing = getDb().prepare("SELECT email FROM outbound_contacts WHERE email IS NOT NULL").all() as { email: string }[];
    for (const row of existing) {
      if (row.email) existingEmails.add(row.email.toLowerCase());
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Simple CSV parse (handles quoted fields)
      const fields = parseCSVLine(line);

      const name = nameIdx >= 0 ? fields[nameIdx]?.trim() : undefined;
      const email = emailIdx >= 0 ? fields[emailIdx]?.trim() : undefined;
      const company = companyIdx >= 0 ? fields[companyIdx]?.trim() : undefined;
      const role = roleIdx >= 0 ? fields[roleIdx]?.trim() : undefined;
      const notes = notesIdx >= 0 ? fields[notesIdx]?.trim() : undefined;
      const tags = tagsIdx >= 0 ? fields[tagsIdx]?.trim() : undefined;

      if (!name && !email) {
        skipped.push({ line: i + 1, reason: "Missing name and email" });
        continue;
      }

      if (email && !isValidEmail(email)) {
        skipped.push({ line: i + 1, reason: `Invalid email: ${email}` });
        continue;
      }

      if (email && existingEmails.has(email.toLowerCase())) {
        skipped.push({ line: i + 1, reason: `Duplicate email: ${email}` });
        continue;
      }

      const contact = await createContact({
        name: name || email || "Unknown",
        email: email || undefined,
        company: company || undefined,
        role: role || undefined,
        notes: notes || undefined,
        tags: tags || undefined,
        project_id: project_id || undefined,
      });

      if (email) existingEmails.add(email.toLowerCase());
      imported.push(contact.id);
    }

    logActivity({
      action: "contacts_imported",
      project_id: project_id || undefined,
      details: `Imported ${imported.length} contacts from CSV (${skipped.length} skipped)`,
    });

    return NextResponse.json({
      imported: imported.length,
      skipped: skipped.length,
      skipped_details: skipped.slice(0, 20),
      total_lines: lines.length - 1,
    });
  } catch (error) {
    console.error("POST /api/outbound/import error:", error);
    return NextResponse.json({ error: "Failed to import contacts" }, { status: 500 });
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
