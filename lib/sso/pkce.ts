import { createHash, randomBytes } from "node:crypto";

// Cadena aleatoria base64url (sin relleno) con `bytes` bytes de entropía.
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function createCodeVerifier(): string {
  return randomToken(32); // 43 caracteres, dentro del rango 43–128 de RFC 7636.
}

// code_challenge = BASE64URL(SHA256(code_verifier)) (método S256).
export function codeChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
