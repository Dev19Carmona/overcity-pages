import { del, put } from "@vercel/blob";
import { revalidateTag } from "next/cache";
import { isAdmin } from "@/lib/auth";
import { replaceLogoUrl } from "@/lib/content";

const MAX_BYTES = 2 * 1024 * 1024;

const TYPES: Record<string, { ext: string; matches: (b: Uint8Array) => boolean }> = {
  "image/png": {
    ext: "png",
    matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  "image/jpeg": {
    ext: "jpg",
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  "image/webp": {
    ext: "webp",
    // "RIFF" en 0-3 y "WEBP" en 8-11.
    matches: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
};

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function deleteBlob(url: string | null) {
  if (!url) return;
  try {
    await del(url);
  } catch {
    // Un blob huérfano no debe romper el cambio de logo.
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return error("Tu sesión expiró. Vuelve a entrar.", 401);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return error("El almacenamiento de imágenes no está configurado.", 500);
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("logo");
  if (!(file instanceof File)) return error("Selecciona una imagen.", 400);

  const type = TYPES[file.type];
  if (!type) return error("La imagen debe ser PNG, JPG o WebP.", 400);
  if (file.size > MAX_BYTES) return error("La imagen no puede superar 2 MB.", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!type.matches(bytes)) return error("El archivo no es una imagen válida.", 400);

  const blob = await put(`logo/logo.${type.ext}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  }).catch(() => null);
  if (!blob) return error("No se pudo subir la imagen. Intenta de nuevo.", 500);

  let previous: string | null;
  try {
    previous = await replaceLogoUrl(blob.url);
  } catch {
    await deleteBlob(blob.url);
    return error("No se pudo guardar el logo. Intenta de nuevo.", 500);
  }

  await deleteBlob(previous);
  revalidateTag("content", { expire: 0 });
  return Response.json({ logoUrl: blob.url });
}

export async function DELETE() {
  if (!(await isAdmin())) return error("Tu sesión expiró. Vuelve a entrar.", 401);

  let previous: string | null;
  try {
    previous = await replaceLogoUrl(null);
  } catch {
    return error("No se pudo quitar el logo. Intenta de nuevo.", 500);
  }

  await deleteBlob(previous);
  revalidateTag("content", { expire: 0 });
  return Response.json({ logoUrl: null });
}
