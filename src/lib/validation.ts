const MAX_STRING_LENGTH = 500;
const MAX_TEXT_LENGTH = 10000;

export function sanitize(input: unknown): string {
  if (typeof input !== "string") return String(input ?? "");
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function validateRequired(
  body: Record<string, unknown>,
  fields: string[]
): string | null {
  for (const field of fields) {
    const val = body[field];
    if (val === undefined || val === null) return `${field} is required`;
    if (typeof val === "string" && !val.trim()) return `${field} is required`;
  }
  return null;
}

export function sanitizeBody<T extends Record<string, unknown>>(
  body: T,
  textFields: string[] = []
): T {
  const cleaned = { ...body };
  for (const [key, value] of Object.entries(cleaned)) {
    if (typeof value === "string") {
      const maxLen = textFields.includes(key) ? MAX_TEXT_LENGTH : MAX_STRING_LENGTH;
      (cleaned as Record<string, unknown>)[key] = sanitize(value).slice(0, maxLen);
    }
  }
  return cleaned;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}
