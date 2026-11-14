import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import NightScene from "@/app/_components/night-scene";
import { getPublicCatalog } from "@/lib/catalog";
import { formatPrice, type CatalogCurrency, type CatalogProduct } from "@/lib/catalog-shared";
import { getPublicContent } from "@/lib/content";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red";

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await getPublicCatalog();
  return { title: `${catalog.title} · OverCity` };
}

function ProductCard({
  product,
  currency,
}: {
  product: CatalogProduct;
  currency: CatalogCurrency;
}) {
  return (
    <Link
      href={`/catalogo/${product.id}`}
      className={`flex h-full flex-col overflow-hidden rounded-2xl border border-border-soft bg-black/30 shadow-sm backdrop-blur-md transition-all duration-300 motion-safe:hover:-translate-y-1 hover:border-theme-red hover:shadow-[0_0_15px_rgba(216,26,33,0.3)] ${focusRing}`}
    >
      <Image
        src={product.images[0]}
        alt={product.name}
        width={400}
        height={400}
        unoptimized
        className="aspect-square w-full object-cover"
      />
      <div className="flex min-w-0 flex-col gap-1 p-3">
        <h3 className="break-words text-sm font-semibold text-white">{product.name}</h3>
        {product.price !== null && (
          <p className="text-sm font-semibold text-theme-red">
            {formatPrice(product.price, currency)}
          </p>
        )}
      </div>
    </Link>
  );
}

export default async function CatalogPage() {
  const [catalog, content] = await Promise.all([getPublicCatalog(), getPublicContent()]);
  const { products, categories, currency } = catalog;

  const sections = [
    ...categories.map((category) => ({
      id: category.id,
      name: category.name as string | null,
      items: products.filter((product) => product.categoryId === category.id),
    })),
    {
      id: "none",
      name: (categories.length > 0 ? "Sin categoría" : null) as string | null,
      items: products.filter((product) => product.categoryId === null),
    },
  ].filter((section) => section.items.length > 0);

  return (
    <>
      <NightScene background={content.background} effectsEnabled={content.effectsEnabled} />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-8 px-4 pb-10 pt-8">
        <Link
          href="/"
          className={`self-start rounded-full border border-border-soft bg-black/30 px-4 py-2 text-sm font-semibold backdrop-blur-md transition hover:border-theme-red ${focusRing}`}
        >
          ← Volver
        </Link>

        <h1 className="premium-heading w-full text-lg font-semibold text-white">
          <span className="oni-mask" aria-hidden="true">👺</span>
          <span>{catalog.title}</span>
          <span className="oni-mask" aria-hidden="true">👹</span>
        </h1>

        {sections.length === 0 && (
          <p className="text-center text-sm">Todavía no hay productos disponibles.</p>
        )}

        {sections.map((section) => (
          <section key={section.id} className="flex w-full flex-col gap-4">
            {section.name && (
              <h2 className="break-words text-base font-semibold text-white">{section.name}</h2>
            )}
            <ul className="grid grid-cols-2 gap-3">
              {section.items.map((product) => (
                <li key={product.id} className="min-w-0">
                  <ProductCard product={product} currency={currency} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
