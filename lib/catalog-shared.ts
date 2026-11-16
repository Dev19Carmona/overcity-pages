// Tipos y utilidades del catálogo (SPEC 06 y 07) seguros para el cliente (sin acceso a Redis).
export const CATALOG_CURRENCIES = ["COP", "USD", "EUR", "MXN", "ARS", "PEN", "CLP", "BRL"] as const;
export type CatalogCurrency = (typeof CATALOG_CURRENCIES)[number];

// Colores del catálogo (SPEC 11): el nombre es el identificador estable (lo usan diseños, stock y bolsa).
export type CatalogColor = string;

export type CatalogColorDef = {
  name: string; // 1 a MAX_COLOR_NAME caracteres, único sin distinguir mayúsculas ni tildes
  hex: string; // "#RRGGBB"
  hidden: boolean; // true: no se ofrece al elegir colores de un diseño
};

export const COLOR_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_HEX = "#808080";

// Semilla: la antigua paleta fija.
export const DEFAULT_COLORS: CatalogColorDef[] = [
  { name: "Negro", hex: "#141414", hidden: false },
  { name: "Blanco", hex: "#e6e6e6", hidden: false },
  { name: "Rojo", hex: "#d81a21", hidden: false },
  { name: "Navy", hex: "#1b4263", hidden: false },
  { name: "Gris", hex: "#6b7178", hidden: false },
  { name: "Arena", hex: "#b8a684", hidden: false },
];

// Hex de un color por nombre; gris neutro si no existe (solo para no romper el render).
export function colorHex(colors: readonly { name: string; hex: string }[], name: string): string {
  return colors.find((color) => color.name === name)?.hex ?? FALLBACK_HEX;
}

export const CATALOG_SIZES = ["XS", "S", "M", "L", "XL"] as const;
export const ONE_SIZE = "Única";

export type CatalogCategory = {
  id: string; // uuid generado al crear
  name: string; // 1 a 40 caracteres, único sin distinguir mayúsculas ni tildes
  oneSize: boolean; // true = sus productos solo tienen la talla "Única"
};

// Stock por color y talla (SPEC 09): stock[color][talla]. Las claves de primer nivel son los colores
// del diseño y las de segundo nivel, las tallas de la categoría; cada valor es un entero 0..MAX_STOCK.
export type DesignStock = Record<string, Record<string, number>>;

// Diseño (SPEC 10): una foto, sus colores y su stock por color y talla.
export type CatalogDesign = {
  id: string; // estable dentro del producto
  name: string; // 1 a MAX_DESIGN_NAME caracteres, único dentro del producto
  image: string; // URL de Vercel Blob
  colors: CatalogColor[]; // 1 a 6, sin repetir
  stock: DesignStock; // stock[color][talla]
};

export type CatalogProduct = {
  id: string; // uuid; es el id de /catalogo/[id]
  name: string; // 1 a 60 caracteres
  description: string; // hasta 500 caracteres; "" si no hay
  price: number | null; // entero >= 0 en la moneda del catálogo; null = sin precio
  categoryId: string | null; // null = sin categoría
  visible: boolean; // false = no sale en el sitio público
  designs: CatalogDesign[]; // 1 a 8; designs[0] es la portada
};

export type Catalog = {
  title: string; // hasta 60 caracteres, por defecto "Catálogo"
  currency: CatalogCurrency; // por defecto "COP"
  whatsapp: string; // solo dígitos con código de país (8 a 15); "" = sin configurar (SPEC 08)
  freeShippingFrom: number | null; // entero 1..MAX_PRICE en la moneda del catálogo; null = sin barra
  categories: CatalogCategory[]; // el orden del arreglo es el orden en pantalla
  colors: CatalogColorDef[]; // 0 a MAX_COLORS; el orden es el orden de presentación (SPEC 11)
  products: CatalogProduct[]; // el orden del arreglo es el orden en pantalla ("Destacados")
};

// Tallas de una categoría: "Única" si es de talla única; sin categoría, XS a XL.
export function sizesFor(category: Pick<CatalogCategory, "oneSize"> | null | undefined): string[] {
  return category?.oneSize ? [ONE_SIZE] : [...CATALOG_SIZES];
}

// Tabla de stock en 0: una fila por color y una celda por talla.
export function emptyStock(colors: readonly string[], sizes: readonly string[]): DesignStock {
  return Object.fromEntries(
    colors.map((color) => [color, Object.fromEntries(sizes.map((size) => [size, 0]))]),
  );
}

// Unidades de una combinación diseño + color + talla; 0 si no existe.
export function stockOf(
  product: { designs: { id: string; stock: DesignStock }[] },
  designId: string,
  color: string,
  size: string,
): number {
  const design = product.designs.find((item) => item.id === designId);
  const units = design?.stock[color]?.[size];
  return typeof units === "number" ? units : 0;
}

// Suma de las tallas de un color de un diseño.
export function colorStock(design: { stock: DesignStock }, color: string): number {
  return Object.values(design.stock[color] ?? {}).reduce((sum, value) => sum + value, 0);
}

// Suma de todo un diseño.
export function designStock(design: { stock: DesignStock }): number {
  return Object.values(design.stock).reduce(
    (total, row) => total + Object.values(row).reduce((sum, value) => sum + value, 0),
    0,
  );
}

// Suma de todos los diseños, colores y tallas.
export function stockTotal(product: { designs: { stock: DesignStock }[] }): number {
  return product.designs.reduce((total, design) => total + designStock(design), 0);
}

// Unión de los colores de los diseños, en el orden de la lista del catálogo.
export function productColors(
  product: { designs: { colors: CatalogColor[] }[] },
  colors: readonly { name: string }[],
): CatalogColor[] {
  const used = new Set(product.designs.flatMap((d) => d.colors));
  const ordered = colors.map((c) => c.name).filter((name) => used.has(name));
  const extra = [...used].filter((name) => !ordered.includes(name));
  return [...ordered, ...extra];
}

// Uso de un color: en cuántos diseños y en cuántos productos está.
export function colorUsage(
  catalog: { products: { designs: { colors: CatalogColor[] }[] }[] },
  name: string,
): { designs: number; products: number } {
  let designs = 0;
  let products = 0;
  for (const product of catalog.products) {
    const count = product.designs.filter((d) => d.colors.includes(name)).length;
    designs += count;
    if (count > 0) products += 1;
  }
  return { designs, products };
}

// Foto del primer diseño.
export function coverImage(product: { designs: { image: string }[] }): string {
  return product.designs[0]?.image ?? "";
}

// Ajusta la tabla a los colores y tallas actuales. Un color nuevo entra en 0 y uno quitado
// desaparece. Si las tallas de una fila cambian: "Única" suma la fila; de ahí a varias tallas vuelve a 0.
export function resizeStock(
  stock: DesignStock,
  colors: readonly string[],
  sizes: readonly string[],
): DesignStock {
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
