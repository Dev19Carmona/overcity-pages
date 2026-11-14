import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductDetail from "@/app/catalogo/[id]/_components/product-detail";
import StoreShell, { STORE_WIDTH } from "@/app/_components/store-shell";
import { getPublicCatalog } from "@/lib/catalog";
import { getPublicContent } from "@/lib/content";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red";

// La ruta bloquea hasta saber si el producto existe, para poder responder 404 en vez de enviar
// primero un esqueleto con Suspense (que dejaría el estado en 200). Sin esto, el modo desarrollo
// avisa de que `params` se usa fuera de <Suspense>; el aviso es solo de desarrollo.
export const instant = false;

// Con cacheComponents hace falta al menos un parámetro de muestra; sin productos se usa un id
// que no existe y responde 404.
export async function generateStaticParams() {
  const { products } = await getPublicCatalog();
  const ids = products.map((product) => ({ id: product.id }));
  return ids.length > 0 ? ids : [{ id: "sin-productos" }];
}

async function findProduct(id: string) {
  const catalog = await getPublicCatalog();
  const product = catalog.products.find((item) => item.id === id);
  return product ? { product, catalog } : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/catalogo/[id]">): Promise<Metadata> {
  const { id } = await params;
  const found = await findProduct(id);
  return { title: found ? `${found.product.name} · OverCity` : "Producto no encontrado" };
}

export default async function ProductPage({ params }: PageProps<"/catalogo/[id]">) {
  const { id } = await params;
  const [found, content] = await Promise.all([findProduct(id), getPublicContent()]);
  if (!found) notFound();

  const { product, catalog } = found;
  const category = catalog.categories.find((item) => item.id === product.categoryId);

  return (
    <StoreShell content={content} catalogTitle={catalog.title} active="catalog">
      <main className={`${STORE_WIDTH} flex flex-1 flex-col gap-[18px] pb-14 pt-[clamp(16px,3vw,32px)]`}>
        <div className="flex items-center gap-2 text-[13px] text-white/75">
          <Link
            href="/catalogo"
            className={`rounded-full border border-border-soft bg-black/30 px-3.5 py-[7px] font-semibold text-white transition hover:border-theme-red ${focusRing}`}
          >
            ← {catalog.title}
          </Link>
          {category && (
            <>
              <span aria-hidden="true">/</span>
              <Link
                href={`/catalogo?categoria=${category.id}`}
                className={`truncate hover:text-white ${focusRing}`}
              >
                {category.name}
              </Link>
            </>
          )}
        </div>
        <ProductDetail
          key={product.id}
          product={product}
          categoryName={category?.name ?? null}
          currency={catalog.currency}
        />
      </main>
    </StoreShell>
  );
}
