import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join, basename } from "path";

// GET /api/library/report?filename=<foo>.pdf — stream a generated PDF report back.
// Hardened: the filename is sanitized to the basename so the caller can't escape
// the reports directory with "../" tricks.

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("filename");
  if (!requested) return NextResponse.json({ error: "filename is required" }, { status: 400 });

  const safeName = basename(requested);
  if (!safeName.endsWith(".pdf")) {
    return NextResponse.json({ error: "Only .pdf files are served" }, { status: 400 });
  }

  const path = join(process.cwd(), "data", "reports", safeName);
  if (!existsSync(path)) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const buf = readFileSync(path);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(buf.length),
    },
  });
}
