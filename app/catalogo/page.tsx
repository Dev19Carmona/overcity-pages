import type { Metadata } from "next";
import CatalogBrowser from "@/app/catalogo/_components/catalog-browser";
import StoreShell, { STORE_WIDTH } from "@/app/_components/store-shell";
import { getPublicCatalog } from "@/lib/catalog";
import { getPublicContent } from "@/lib/content";

export async function generateMetadata(): Promise<Metadata> {
  const catalog = await getPublicCatalog();
  return { title: `${catalog.title} · OverCity` };
}

export default async function CatalogPage() {
  const [catalog, content] = await Promise.all([getPublicCatalog(), getPublicContent()]);

  return (
    <StoreShell content={content} catalogTitle={catalog.title} active="catalog">
      <main
        className={`${STORE_WIDTH} flex flex-1 flex-col gap-4 pb-14 pt-[clamp(20px,3vw,36px)]`}
      >
        <CatalogBrowser catalog={catalog} />
      </main>
    </StoreShell>
  );
}
