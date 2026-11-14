import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAdmin } from "@/lib/auth";
import {
  BACKGROUND_TYPES,
  MAX_BACKGROUND_BYTES,
  MAX_MUSIC_BYTES,
  MAX_PRODUCT_IMAGE_BYTES,
  MUSIC_TYPES,
  PRODUCT_IMAGE_TYPES,
} from "@/lib/content-limits";

// Entrega tokens para que el navegador suba fondo, música e imágenes del catálogo directo a Vercel Blob
// (el MP3 supera el tope de ~4,5 MB de las funciones). Solo con sesión de admin.
// No depende de onUploadCompleted: el guardado escribe la URL que devuelve la subida.
function rules(pathname: string) {
  if (pathname.startsWith("background/")) {
    return { allowedContentTypes: BACKGROUND_TYPES, maximumSizeInBytes: MAX_BACKGROUND_BYTES };
  }
  if (pathname.startsWith("music/")) {
    return { allowedContentTypes: MUSIC_TYPES, maximumSizeInBytes: MAX_MUSIC_BYTES };
  }
  if (pathname.startsWith("catalog/")) {
    return { allowedContentTypes: PRODUCT_IMAGE_TYPES, maximumSizeInBytes: MAX_PRODUCT_IMAGE_BYTES };
  }
  return null;
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: "Tu sesión expiró. Vuelve a entrar." }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: "El almacenamiento de archivos no está configurado." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return Response.json({ error: "Petición inválida." }, { status: 400 });

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const allowed = rules(pathname);
        if (!allowed) throw new Error("Ruta de subida no permitida.");
        return { ...allowed, addRandomSuffix: true };
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo preparar la subida." },
      { status: 400 },
    );
  }
}
