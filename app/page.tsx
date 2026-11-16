import SiteView from "@/app/_components/site-view";
import { getPublicCatalog } from "@/lib/catalog";
import { coverImage } from "@/lib/catalog-shared";
import { getPublicContent } from "@/lib/content";

export default async function Home() {
  const [content, catalog] = await Promise.all([getPublicContent(), getPublicCatalog()]);
  // El botón del catálogo solo aparece si hay al menos un producto visible.
  const catalogLabel = catalog.products.length > 0 ? catalog.title : null;
  // Un botón por categoría con productos visibles; la portada es la del primer producto.
  const catalogCategories = catalog.categories.flatMap((category) => {
    const products = catalog.products.filter((product) => product.categoryId === category.id);
    return products.length > 0
      ? [{ id: category.id, name: category.name, count: products.length, cover: coverImage(products[0]) }]
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
