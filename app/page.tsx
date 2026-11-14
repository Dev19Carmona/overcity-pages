import SiteView from "@/app/_components/site-view";
import { getPublicCatalog } from "@/lib/catalog";
import { getPublicContent } from "@/lib/content";

export default async function Home() {
  const [content, catalog] = await Promise.all([getPublicContent(), getPublicCatalog()]);
  // El botón del catálogo solo aparece si hay al menos un producto visible.
  const catalogLabel = catalog.products.length > 0 ? catalog.title : null;

  return <SiteView content={content} catalogLabel={catalogLabel} />;
}
