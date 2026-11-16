import SiteView from "@/app/_components/site-view";
import { getPublicCatalogList } from "@/lib/catalog";
import { getPublicContent } from "@/lib/content";

export default async function Home() {
  const [content, catalog] = await Promise.all([getPublicContent(), getPublicCatalogList()]);
  // El botón del catálogo solo aparece si hay al menos un producto visible.
  const catalogLabel = catalog.products.length > 0 ? catalog.title : null;
  // Un botón por categoría con productos visibles; la portada es la del primer producto.
  const catalogCategories = catalog.categories.flatMap((category) => {
    const products = catalog.products.filter((product) => product.categoryId === category.id);
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
