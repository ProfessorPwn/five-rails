// ─── PDF Report Generator ────────────────────────────────────────────────────
// Renders a markdown-flavored report to a PDF Buffer using pdfkit.
// Not a full markdown parser — handles what agent reports actually use:
// headings, bold, italics, lists, code blocks, paragraphs, horizontal rules.

import PDFDocument from "pdfkit";

export interface PdfReportOptions {
  title: string;
  markdown: string;
  author?: string;
  subject?: string;
}

export async function generatePdfReport(opts: PdfReportOptions): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margin: 60,
        info: {
          Title: opts.title,
          Author: opts.author || "Five Rails",
          Subject: opts.subject || opts.title,
          Creator: "Five Rails",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      renderTitle(doc, opts.title);
      renderMeta(doc, opts);
      renderMarkdown(doc, opts.markdown);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function renderTitle(doc: PDFKit.PDFDocument, title: string) {
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor("#0a0c14")
    .text(title, { align: "left" });
  doc.moveDown(0.3);
  doc
    .strokeColor("#1f2937")
    .lineWidth(1)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.8);
}

function renderMeta(doc: PDFKit.PDFDocument, opts: PdfReportOptions) {
  const date = new Date().toISOString().split("T")[0];
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#6b7280")
    .text(`${opts.author || "Five Rails"}  ·  ${date}`, { align: "left" });
  doc.moveDown(1.2);
  doc.fillColor("#0a0c14");
}

// ── Markdown → PDFKit ────────────────────────────────────────────────────────

function renderMarkdown(doc: PDFKit.PDFDocument, md: string) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let inCode = false;
  const codeBuf: string[] = [];

  const flushCode = () => {
    if (!codeBuf.length) return;
    doc
      .font("Courier")
      .fontSize(9)
      .fillColor("#374151");
    const boxY = doc.y;
    const text = codeBuf.join("\n");
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    // Background
    const height = doc.heightOfString(text, { width: width - 16 }) + 12;
    doc
      .save()
      .fillColor("#f3f4f6")
      .rect(doc.page.margins.left, boxY, width, height)
      .fill()
      .restore();
    doc.text(text, doc.page.margins.left + 8, boxY + 6, { width: width - 16 });
    doc.y = boxY + height + 4;
    doc.moveDown(0.4);
    doc.fillColor("#0a0c14");
    codeBuf.length = 0;
  };

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");

    // Code fences
    if (/^```/.test(line)) {
      if (inCode) flushCode();
      inCode = !inCode;
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    // Blank line
    if (!line.trim()) {
      doc.moveDown(0.4);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      doc
        .strokeColor("#e5e7eb")
        .lineWidth(0.5)
        .moveTo(doc.page.margins.left, doc.y + 4)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y + 4)
        .stroke();
      doc.moveDown(0.6);
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      const sizeMap: Record<number, number> = { 1: 18, 2: 15, 3: 13, 4: 11 };
      const spaceBefore = level <= 2 ? 0.6 : 0.3;
      doc.moveDown(spaceBefore);
      doc
        .font("Helvetica-Bold")
        .fontSize(sizeMap[level] || 11)
        .fillColor("#0a0c14")
        .text(h[2], { width: contentWidth(doc) });
      doc.moveDown(0.2);
      continue;
    }

    // Bullet list
    const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bullet) {
      const indent = Math.floor(bullet[1].length / 2) * 12;
      doc.font("Helvetica").fontSize(10).fillColor("#0a0c14");
      const x = doc.page.margins.left + indent;
      const bulletY = doc.y;
      doc.text("\u2022", x, bulletY, { continued: false, width: 10 });
      renderInline(doc, bullet[2], x + 14, bulletY, contentWidth(doc) - indent - 14);
      doc.moveDown(0.2);
      continue;
    }

    // Numbered list
    const numbered = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (numbered) {
      const indent = Math.floor(numbered[1].length / 2) * 12;
      doc.font("Helvetica").fontSize(10).fillColor("#0a0c14");
      const x = doc.page.margins.left + indent;
      const prefix = `${numbered[2]}.`;
      const y = doc.y;
      doc.text(prefix, x, y, { width: 22 });
      renderInline(doc, numbered[3], x + 22, y, contentWidth(doc) - indent - 22);
      doc.moveDown(0.2);
      continue;
    }

    // Block quote
    if (/^>\s?/.test(line)) {
      const text = line.replace(/^>\s?/, "");
      const y = doc.y;
      doc
        .strokeColor("#9ca3af")
        .lineWidth(2)
        .moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.margins.left, y + 14)
        .stroke();
      doc.font("Helvetica-Oblique").fontSize(10).fillColor("#4b5563");
      renderInline(doc, text, doc.page.margins.left + 10, y, contentWidth(doc) - 10);
      doc.moveDown(0.3);
      doc.fillColor("#0a0c14");
      continue;
    }

    // Paragraph
    doc.font("Helvetica").fontSize(10).fillColor("#0a0c14");
    renderInline(doc, line, doc.page.margins.left, doc.y, contentWidth(doc));
    doc.moveDown(0.3);
  }

  if (inCode) flushCode();
}

// Render one line of text with inline bold/italic/code, breaking into runs.
function renderInline(doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number) {
  const runs = splitInline(text);
  doc.x = x;
  doc.y = y;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const isLast = i === runs.length - 1;
    if (r.kind === "bold") doc.font("Helvetica-Bold");
    else if (r.kind === "italic") doc.font("Helvetica-Oblique");
    else if (r.kind === "code") doc.font("Courier").fillColor("#b91c1c");
    else doc.font("Helvetica").fillColor("#0a0c14");
    doc.text(r.text, { continued: !isLast, width });
    if (r.kind === "code") doc.fillColor("#0a0c14");
  }
}

type Run = { kind: "text" | "bold" | "italic" | "code"; text: string };

function splitInline(text: string): Run[] {
  const runs: Run[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[2]) runs.push({ kind: "bold", text: m[2] });
    else if (m[4]) runs.push({ kind: "italic", text: m[4] });
    else if (m[6]) runs.push({ kind: "code", text: m[6] });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ kind: "text", text: text.slice(last) });
  if (!runs.length) runs.push({ kind: "text", text });
  return runs;
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}
