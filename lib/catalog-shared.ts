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

// Stock por color y talla (SPEC 09): stock[color][talla]. Las claves de primer nivel son los colores
// del producto y las de segundo nivel, las tallas de su categoría; cada valor es un entero 0..MAX_STOCK.
export type ProductStock = Record<string, Record<string, number>>;

export type CatalogProduct = {
  id: string; // uuid; es el id de /catalogo/[id]
  name: string; // 1 a 60 caracteres
  description: string; // hasta 500 caracteres; "" si no hay
  price: number | null; // entero >= 0 en la moneda del catálogo; null = sin precio
  categoryId: string | null; // null = sin categoría
  visible: boolean; // false = no sale en el sitio público
  colors: CatalogColor[]; // 1 a 6, sin repetir
  stock: ProductStock; // stock[color][talla]; ver ProductStock
  images: CatalogImage[]; // 1 a 8; images[0] es la portada
};

export type Catalog = {
  title: string; // hasta 60 caracteres, por defecto "Catálogo"
  currency: CatalogCurrency; // por defecto "COP"
  whatsapp: string; // solo dígitos con código de país (8 a 15); "" = sin configurar (SPEC 08)
  freeShippingFrom: number | null; // entero 1..MAX_PRICE en la moneda del catálogo; null = sin barra
  categories: CatalogCategory[]; // el orden del arreglo es el orden en pantalla
  products: CatalogProduct[]; // el orden del arreglo es el orden en pantalla ("Destacados")
};

// Tallas de una categoría: "Única" si es de talla única; sin categoría, XS a XL.
export function sizesFor(category: Pick<CatalogCategory, "oneSize"> | null | undefined): string[] {
  return category?.oneSize ? [ONE_SIZE] : [...CATALOG_SIZES];
}

// Tabla de stock en 0: una fila por color y una celda por talla.
export function emptyStock(colors: readonly string[], sizes: readonly string[]): ProductStock {
  return Object.fromEntries(
    colors.map((color) => [color, Object.fromEntries(sizes.map((size) => [size, 0]))]),
  );
}

// Unidades de una combinación color + talla; 0 si no existe.
export function stockOf(product: { stock: ProductStock }, color: string, size: string): number {
  const units = product.stock[color]?.[size];
  return typeof units === "number" ? units : 0;
}

// Suma de las tallas de un color.
export function colorStock(product: { stock: ProductStock }, color: string): number {
  return Object.values(product.stock[color] ?? {}).reduce((sum, value) => sum + value, 0);
}

// Suma de todos los colores y tallas.
export function stockTotal(product: { stock: ProductStock }): number {
  return Object.values(product.stock).reduce(
    (total, row) => total + Object.values(row).reduce((sum, value) => sum + value, 0),
    0,
  );
}

// Ajusta la tabla a los colores y tallas actuales. Un color nuevo entra en 0 y uno quitado
// desaparece. Si las tallas de una fila cambian: "Única" suma la fila; de ahí a varias tallas vuelve a 0.
export function resizeStock(
  stock: ProductStock,
  colors: readonly string[],
  sizes: readonly string[],
): ProductStock {
  const oneSize = sizes.length === 1 && sizes[0] === ONE_SIZE;
  return Object.fromEntries(
    colors.map((color) => {
      const row = stock[color];
      if (row && Object.keys(row).length === sizes.length && sizes.every((size) => size in row)) {
        return [color, Object.fromEntries(sizes.map((size) => [size, row[size]]))];
      }
      if (oneSize && row) {
        return [color, { [ONE_SIZE]: Object.values(row).reduce((sum, value) => sum + value, 0) }];
      }
      return [color, Object.fromEntries(sizes.map((size) => [size, 0]))];
    }),
  );
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

// Quita todo lo que no sea dígito y comprueba 8 a 15 dígitos (E.164). "" es válido (sin número).
export function normalizeWhatsapp(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits === "") return "";
  return /^\d{8,15}$/.test(digits) ? digits : null;
}
