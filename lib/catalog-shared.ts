// Tipos y utilidades del catálogo (SPEC 06 y 07) seguros para el cliente (sin acceso a Redis).
export const CATALOG_CURRENCIES = ["COP", "USD", "EUR", "MXN", "ARS", "PEN", "CLP", "BRL"] as const;
export type CatalogCurrency = (typeof CATALOG_CURRENCIES)[number];

// Paleta fija de colores de producto (la del diseño de la tienda).
export const CATALOG_COLORS = ["Negro", "Blanco", "Rojo", "Navy", "Gris", "Arena"] as const;
export type CatalogColor = (typeof CATALOG_COLORS)[number];
export const CATALOG_COLOR_HEX: Record<CatalogColor, string> = {
  Negro: "#141414",
  Blanco: "#e6e6e6",
  Rojo: "#d81a21",
  Navy: "#1b4263",
  Gris: "#6b7178",
  Arena: "#b8a684",
};

export const CATALOG_SIZES = ["XS", "S", "M", "L", "XL"] as const;
export const ONE_SIZE = "Única";

export type CatalogCategory = {
  id: string; // uuid generado al crear
  name: string; // 1 a 40 caracteres, único sin distinguir mayúsculas ni tildes
  oneSize: boolean; // true = sus productos solo tienen la talla "Única"
};

export type CatalogImage = {
  url: string; // URL de Vercel Blob
  color: CatalogColor; // debe estar en product.colors
};

export type CatalogProduct = {
  id: string; // uuid; es el id de /catalogo/[id]
  name: string; // 1 a 60 caracteres
  description: string; // hasta 500 caracteres; "" si no hay
  price: number | null; // entero >= 0 en la moneda del catálogo; null = sin precio
  categoryId: string | null; // null = sin categoría
  visible: boolean; // false = no sale en el sitio público
  colors: CatalogColor[]; // 1 a 6, sin repetir
  stock: Record<string, number>; // una clave por talla de su categoría; entero 0..MAX_STOCK
  images: CatalogImage[]; // 1 a 8; images[0] es la portada
};

export type Catalog = {
  title: string; // hasta 60 caracteres, por defecto "Catálogo"
  currency: CatalogCurrency; // por defecto "COP"
  categories: CatalogCategory[]; // el orden del arreglo es el orden en pantalla
  products: CatalogProduct[]; // el orden del arreglo es el orden en pantalla ("Destacados")
};

// Tallas de una categoría: "Única" si es de talla única; sin categoría, XS a XL.
export function sizesFor(category: Pick<CatalogCategory, "oneSize"> | null | undefined): string[] {
  return category?.oneSize ? [ONE_SIZE] : [...CATALOG_SIZES];
}

export function emptyStock(sizes: readonly string[]): Record<string, number> {
  return Object.fromEntries(sizes.map((size) => [size, 0]));
}

export function stockTotal(product: Pick<CatalogProduct, "stock">): number {
  return Object.values(product.stock).reduce((sum, value) => sum + value, 0);
}

// Minúsculas y sin tildes: sirve para buscar y para comparar nombres de categorías.
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Formato de precio: "$ 85.000" para COP, sin decimales.
export function formatPrice(value: number, currency: CatalogCurrency): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
