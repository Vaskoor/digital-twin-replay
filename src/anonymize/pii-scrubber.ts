// src/anonymize/pii-scrubber.ts — PII detection + redaction
// Detects and scrubs: emails, phone numbers, SSNs, credit cards, API keys, IPs.

const PATTERNS: { name: string; re: RegExp; replacement: string }[] = [
  { name: "email", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "[email-redacted]" },
  { name: "phone", re: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: "[phone-redacted]" },
  { name: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[ssn-redacted]" },
  { name: "credit-card", re: /\b(?:\d[ -]*?){13,16}\b/g, replacement: "[cc-redacted]" },
  { name: "api-key", re: /(sk-[a-zA-Z0-9]{20,}|xai-[a-zA-Z0-9]{20,}|Bearer\s+[a-zA-Z0-9._-]+)/g, replacement: "[key-redacted]" },
  { name: "ipv4", re: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g, replacement: "[ip-redacted]" },
];

/** Scrub PII from a string, returning the cleaned string + list of fields touched. */
export function scrubPII(input: string): { cleaned: string; fields: string[] } {
  const fields: string[] = [];
  let cleaned = input;
  for (const p of PATTERNS) {
    if (p.re.test(cleaned)) {
      fields.push(p.name);
      cleaned = cleaned.replace(p.re, p.replacement);
    }
  }
  return { cleaned, fields };
}

/** Deep-scrub an object — walks every string value + key. */
export function scrubObject<T>(obj: T): T & { _piiFields: string[] } {
  const allFields = new Set<string>();
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const { cleaned, fields } = scrubPII(v);
      fields.forEach((f) => allFields.add(f));
      return cleaned;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  const result = walk(obj) as T;
  return Object.assign(result, { _piiFields: [...allFields] });
}
