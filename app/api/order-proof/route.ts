import { requirePermission } from "@/lib/auth";
import { createProofUpload } from "@/lib/orders";

// SPEC 17: entrega una URL firmada para que el navegador suba el comprobante de un pedido al bucket
// privado. Exige permiso; la ruta la genera el servidor y el bucket impone tamaño y tipos.
export async function POST(request: Request) {
  const auth = await requirePermission("pedidos.pedidos.gestionar");
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  try {
    const upload = await createProofUpload(await request.json().catch(() => null));
    if (!upload.ok) return Response.json({ error: upload.error }, { status: upload.status });
    return Response.json({ path: upload.path, signedUrl: upload.signedUrl });
  } catch {
    return Response.json({ error: "No se pudo preparar la subida." }, { status: 500 });
  }
}
