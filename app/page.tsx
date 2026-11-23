import SiteView from "@/app/_components/site-view";
import { getPublicCatalogList } from "@/lib/catalog";
import { getPublicContent } from "@/lib/content";
import { isModuleActive, requireModule } from "@/lib/modules";

export default async function Home() {
  // SPEC 14: sin el módulo `links` la página de links responde 404.
  await requireModule("links");
  const catalogActive = await isModuleActive("catalogo");
  const [content, catalog] = await Promise.all([
    getPublicContent(),
    // Con `catalogo` apagado no se lee el catálogo ni se muestran botones hacia /catalogo.
    catalogActive ? getPublicCatalogList() : null,
  ]);
  // El botón del catálogo solo aparece si hay al menos un producto visible.
  const catalogLabel = catalog && catalog.products.length > 0 ? catalog.title : null;
  // Un botón por categoría con productos visibles; la portada es la del primer producto.
  const visibleProducts = catalog?.products ?? [];
  const catalogCategories = (catalog?.categories ?? []).flatMap((category) => {
    const products = visibleProducts.filter((product) => product.categoryId === category.id);
    return products.length > 0
      ? [{ id: category.id, name: category.name, count: products.length, cover: products[0].cover }]
      : [];
  });

  return (
    <SiteView
      content={content}
      catalogLabel={catalogLabel}
      catalogCategories={catalogCategories}
    />
  );
}
