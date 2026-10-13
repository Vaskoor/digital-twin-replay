// src/anonymize/token-rotation.ts — rotate auth tokens for safe replay
// Generates deterministic replacement tokens so replayed requests stay consistent.

import crypto from "crypto";

const TOKEN_FIELDS = [
  "authorization", "x-api-key", "x-auth-token", "cookie", "set-cookie",
  "x-access-token", "bearer", "session", "token",
];

const rotationMap = new Map<string, string>();

/** Generate a deterministic replacement token. */
function rotateToken(original: string): string {
  if (rotationMap.has(original)) return rotationMap.get(original)!;
  const hash = crypto.createHash("sha256").update(original).digest("hex").slice(0, 24);
  const replacement = `replay-${hash}`;
  rotationMap.set(original, replacement);
  return replacement;
}

/** Rotate auth tokens in headers — preserves structure, replaces values. */
export function rotateTokens(headers: Record<string, string>): {
  headers: Record<string, string>;
  rotations: { field: string; original: string; replacement: string }[];
} {
  const out: Record<string, string> = {};
  const rotations: { field: string; original: string; replacement: string }[] = [];

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (TOKEN_FIELDS.some((f) => lowerKey.includes(f))) {
      const replacement = rotateToken(value);
      out[key] = replacement;
      rotations.push({ field: key, original: value.slice(0, 8) + "…", replacement });
    } else {
      out[key] = value;
    }
  }
  return { headers: out, rotations };
}

/** Clear the rotation map (between runs). */
export function resetRotations(): void {
  rotationMap.clear();
}
