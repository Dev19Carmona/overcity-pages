// Tipos y utilidades del catálogo (SPEC 06) seguros para el cliente (sin acceso a Redis).
export const CATALOG_CURRENCIES = ["COP", "USD", "EUR", "MXN", "ARS", "PEN", "CLP", "BRL"] as const;
export type CatalogCurrency = (typeof CATALOG_CURRENCIES)[number];

export type CatalogCategory = {
  id: string; // uuid generado al agregar
  name: string; // hasta 40 caracteres
};

export type CatalogProduct = {
  id: string; // uuid; es el id de /catalogo/[id]
  name: string; // 1 a 60 caracteres
  description: string; // hasta 500 caracteres; "" si no hay
  price: number | null; // entero >= 0 en la moneda del catálogo; null = sin precio
  buyUrl: string | null; // http(s), hasta 500 caracteres; null = sin botón de compra
  images: string[]; // 1 a 4 URLs de Vercel Blob; images[0] es la portada
  categoryId: string | null; // null = sin categoría
  visible: boolean; // false = no sale en el sitio público
};

export type Catalog = {
  title: string; // hasta 60 caracteres, por defecto "Catálogo"
  currency: CatalogCurrency; // por defecto "COP"
  categories: CatalogCategory[]; // el orden del arreglo es el orden en pantalla
  products: CatalogProduct[]; // el orden del arreglo es el orden en pantalla
};

// Formato de precio: "$ 85.000" para COP, sin decimales.
export function formatPrice(value: number, currency: CatalogCurrency): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
