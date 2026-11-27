// Sube el comprobante al bucket privado con la URL firmada de /api/order-proof y devuelve su ruta.
import { MAX_PROOF_BYTES, PROOF_TYPES } from "@/lib/content-limits";

export function proofProblem(file: File): string | null {
  if (!PROOF_TYPES.includes(file.type)) return "Solo PNG, JPG o WebP.";
  if (file.size > MAX_PROOF_BYTES) {
    return `La imagen no puede superar ${MAX_PROOF_BYTES / 1048576} MB.`;
  }
  return null;
}

export async function uploadProof(orderId: string, file: File): Promise<string> {
  const response = await fetch("/api/order-proof", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId, contentType: file.type, size: file.size }),
  });
  const target = (await response.json().catch(() => null)) as {
    path?: string;
    signedUrl?: string;
    error?: string;
  } | null;
  if (!response.ok || !target?.signedUrl || !target.path) {
    throw new Error(target?.error ?? "No se pudo preparar la subida.");
  }
  const body = new FormData();
  body.append("cacheControl", "0");
  body.append("", file);
  const upload = await fetch(target.signedUrl, {
    method: "PUT",
    headers: { "x-upsert": "false" },
    body,
  });
  if (!upload.ok) throw new Error("No se pudo subir la imagen.");
  return target.path;
}
