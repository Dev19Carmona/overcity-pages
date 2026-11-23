// URL pública del frontend de base-template (SPEC 16). Solo servidor.
// Devuelve null si falta o no es una URL http(s) válida: el botón no se muestra.
export function getPlatformUrl(): string | null {
  const raw = process.env.PLATFORM_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}
