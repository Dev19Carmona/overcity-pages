import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM con una clave derivada del secreto (SHA-256 con un contexto distinto por uso).
// Formato: base64url(iv[12] | tag[16] | texto cifrado).
function deriveKey(secret: string, context: string): Buffer {
  return createHash("sha256").update(`${context}:${secret}`).digest();
}

export function seal(plain: string, secret: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, context), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

// null si el valor está manipulado, truncado o se cifró con otro secreto o contexto.
export function open(sealed: string, secret: string, context: string): string | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    if (raw.length < 12 + 16 + 1) return null;
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, context), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
