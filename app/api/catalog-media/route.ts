import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/auth";
import { MAX_PRODUCT_IMAGE_BYTES, PRODUCT_IMAGE_TYPES } from "@/lib/content-limits";
import { catalogPublicBase, CATALOG_BUCKET, getSupabase } from "@/lib/supabase";

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// SPEC 12: entrega una URL firmada para que el navegador suba una foto de diseño directo a Supabase
// Storage. Solo con sesión de admin; la ruta (`catalog/<uuid>.<ext>`) la genera el servidor.
// El bucket impone el tamaño (5 MB) y los tipos (PNG/JPG/WebP) además de esta comprobación previa.
export async function POST(request: Request) {
  const auth = await requirePermission("catalogo.productos.editar");
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json(
      { error: "El almacenamiento de fotos no está configurado." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    contentType?: unknown;
    size?: unknown;
  } | null;
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";
  if (!PRODUCT_IMAGE_TYPES.includes(contentType)) {
    return Response.json({ error: "Solo PNG, JPG o WebP." }, { status: 400 });
  }
  if (typeof body?.size === "number" && body.size > MAX_PRODUCT_IMAGE_BYTES) {
    return Response.json(
      { error: `La imagen no puede superar ${MAX_PRODUCT_IMAGE_BYTES / 1048576} MB.` },
      { status: 400 },
    );
  }

  const path = `catalog/${randomUUID()}.${EXTENSIONS[contentType]}`;
  const { data, error } = await supabase.storage.from(CATALOG_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return Response.json({ error: "No se pudo preparar la subida." }, { status: 500 });
  }
  return Response.json({
    path,
    signedUrl: data.signedUrl,
    publicUrl: `${catalogPublicBase()}${path}`,
  });
}
