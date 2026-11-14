import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import NightScene from "@/app/_components/night-scene";
import { getPublicCatalog } from "@/lib/catalog";
import { formatPrice } from "@/lib/catalog-shared";
import { getPublicContent } from "@/lib/content";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red";

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
    <>
      <NightScene background={content.background} effectsEnabled={content.effectsEnabled} />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pb-10 pt-8">
        <Link
          href="/catalogo"
          className={`self-start rounded-full border border-border-soft bg-black/30 px-4 py-2 text-sm font-semibold backdrop-blur-md transition hover:border-theme-red ${focusRing}`}
        >
          ← {catalog.title}
        </Link>

        <ul
          aria-label={`Imágenes de ${product.name}`}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
        >
          {product.images.map((url, index) => (
            <li key={url} className="w-full shrink-0 snap-center">
              <Image
                src={url}
                alt={`${product.name}, imagen ${index + 1}`}
                width={800}
                height={800}
                unoptimized
                priority={index === 0}
                className="aspect-square w-full rounded-2xl border border-border-soft object-cover"
              />
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          {category && <p className="text-xs font-semibold">{category.name}</p>}
          <h1 className="break-words text-2xl font-semibold tracking-[.055em] text-white [text-shadow:0_0_14px_rgba(216,26,33,0.45)]">
            {product.name}
          </h1>
          {product.price !== null && (
            <p className="text-xl font-semibold text-theme-red">
              {formatPrice(product.price, catalog.currency)}
            </p>
          )}
          {product.description && (
            <p className="whitespace-pre-line break-words text-sm text-white">
              {product.description}
            </p>
          )}
        </div>

        {product.buyUrl && (
          <a
            href={product.buyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`block w-full rounded-full border border-theme-red bg-theme-red/20 px-6 py-4 text-center text-base font-semibold text-white shadow-sm backdrop-blur-md transition-all duration-300 motion-safe:hover:-translate-y-1 hover:bg-theme-red/40 hover:shadow-[0_0_15px_rgba(216,26,33,0.3)] ${focusRing}`}
          >
            Comprar
          </a>
        )}
      </main>
    </>
  );
}
