import type { Metadata } from "next";
import CatalogBrowser from "@/app/catalogo/_components/catalog-browser";
import StoreShell, { STORE_WIDTH } from "@/app/_components/store-shell";
import { getPublicCatalogList } from "@/lib/catalog";
import { getPublicContent } from "@/lib/content";
import { requireModule } from "@/lib/modules";

export async function generateMetadata(): Promise<Metadata> {
  await requireModule("catalogo");
  const catalog = await getPublicCatalogList();
  return { title: `${catalog.title} · OverCity` };
}

export default async function CatalogPage() {
  // SPEC 14: sin el módulo `catalogo` la tienda responde 404.
  await requireModule("catalogo");
  const [catalog, content] = await Promise.all([getPublicCatalogList(), getPublicContent()]);

  return (
    <StoreShell content={content} catalog={catalog} active="catalog">
      <main
        className={`${STORE_WIDTH} flex flex-1 flex-col gap-4 pb-14 pt-[clamp(20px,3vw,36px)]`}
      >
        <CatalogBrowser catalog={catalog} />
      </main>
    </StoreShell>
  );
}
