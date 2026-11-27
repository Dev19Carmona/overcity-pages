// Lado del navegador de la solicitud (SPEC 17): espera como máximo REQUEST_TIMEOUT_MS y reutiliza el
// código si se reenvía la misma bolsa en la misma sesión del navegador. Nunca lanza.
import type { CartLine } from "@/lib/cart";
import { REQUEST_TIMEOUT_MS } from "@/lib/content-limits";
import { comboKey } from "@/lib/orders-shared";

export const REQUEST_STORAGE_KEY = "overcity:order-request:v1";

// Identifica el contenido de la bolsa sin importar el orden de las líneas.
export function cartSignature(lines: readonly CartLine[]): string {
  return lines
    .map((line) => `${comboKey(line)}|${line.qty}`)
    .sort()
    .join("\n");
}

function readSaved(signature: string): string | null {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(REQUEST_STORAGE_KEY) ?? "null") as {
      signature?: unknown;
      code?: unknown;
    } | null;
    return saved?.signature === signature && typeof saved.code === "string" ? saved.code : null;
  } catch {
    return null;
  }
}

function writeSaved(signature: string, code: string): void {
  try {
    window.sessionStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify({ signature, code }));
  } catch {
    // Sin almacenamiento, cada envío crea su solicitud.
  }
}

export async function requestCodeFor(
  lines: readonly CartLine[],
  create: (lines: CartLine[]) => Promise<{ code: string | null }>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<string | null> {
  const signature = cartSignature(lines);
  const saved = readSaved(signature);
  if (saved) return saved;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const request = (async () => (await create([...lines])).code)();
    const code = await Promise.race([request, timeout]);
    if (code) writeSaved(signature, code);
    return code;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
