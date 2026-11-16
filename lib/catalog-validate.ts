// Validación del catálogo (SPEC 06 a 12). Sin acceso a Redis ni a Supabase y sin "server-only":
// la usan lib/catalog.ts y el script de migración.
import {
  MAX_CATEGORIES,
  MAX_CATEGORY_NAME,
  MAX_COLORS,
  MAX_COLOR_NAME,
  MAX_DESIGN_COLORS,
  MAX_DESIGNS,
  MAX_DESIGN_NAME,
  MAX_PRICE,
  MAX_PRODUCTS,
  MAX_PRODUCT_DESCRIPTION,
  MAX_PRODUCT_NAME,
  MAX_STOCK,
  MAX_TITLE,
  MAX_URL,
} from "@/lib/content-limits";
import {
  CATALOG_CURRENCIES,
  COLOR_HEX_PATTERN,
  DEFAULT_COLORS,
  normalizeText,
  sizesFor,
  type Catalog,
  type CatalogCategory,
  type CatalogColor,
  type CatalogColorDef,
  type CatalogCurrency,
  type CatalogDesign,
  type CatalogProduct,
  type DesignStock,
} from "@/lib/catalog-shared";

// URL de un archivo de Vercel Blob (catálogo en Redis y script de migración).
export function isBlobUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "blob.vercel-storage.com" ||
        parsed.hostname.endsWith(".blob.vercel-storage.com"))
    );
  } catch {
    return false;
  }
}

export type CatalogValidation =
  | { ok: true; catalog: Catalog }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${field} debe ser texto.`);
  const trimmed = value.trim();
  if (!trimmed && !allowEmpty) throw new Error(`${field} no puede estar vacío.`);
  if (trimmed.length > max) {
    throw new Error(`${field} no puede superar ${max} caracteres.`);
  }
  return trimmed;
}

function price(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_PRICE) {
    throw new Error(`${field} debe ser un número entero entre 0 y ${MAX_PRICE}.`);
  }
  return value;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function guard<T>(fn: () => T): ValidationResult<T> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Datos inválidos." };
  }
}

// Comprobación de la URL de una foto de diseño. Por defecto, Vercel Blob (catálogo en Redis);
// la capa de Postgres (SPEC 12) pasa la comprobación de Supabase Storage.
export type ImageCheck = (url: string) => boolean;

export type CatalogSettingsInput = {
  title: string;
  currency: CatalogCurrency;
  whatsapp: string;
  freeShippingFrom: number | null;
};

function parseSettings(input: unknown): CatalogSettingsInput {
  if (!isRecord(input)) throw new Error("Ajustes inválidos.");
  const { currency } = input;
  if (!CATALOG_CURRENCIES.includes(currency as CatalogCurrency)) {
    throw new Error("La moneda no está en la lista permitida.");
  }
  const whatsapp = input.whatsapp ?? "";
  if (typeof whatsapp !== "string" || !/^(\d{8,15})?$/.test(whatsapp)) {
    throw new Error("El número de WhatsApp debe tener entre 8 y 15 dígitos, con código de país.");
  }
  const freeShippingFrom = input.freeShippingFrom ?? null;
  if (
    freeShippingFrom !== null &&
    (typeof freeShippingFrom !== "number" ||
      !Number.isInteger(freeShippingFrom) ||
      freeShippingFrom < 1 ||
      freeShippingFrom > MAX_PRICE)
  ) {
    throw new Error(`El envío gratis debe ser un entero entre 1 y ${MAX_PRICE}, o quedar vacío.`);
  }
  return {
    title: text(input.title, "El título del catálogo", MAX_TITLE),
    currency: currency as CatalogCurrency,
    whatsapp,
    freeShippingFrom,
  };
}

function parseColors(input: unknown): CatalogColorDef[] {
  // SPEC 11: sin `colors` se usa la semilla (catálogos guardados antes de la SPEC 11 y v1).
  const raw = input === undefined ? DEFAULT_COLORS : input;
  if (!Array.isArray(raw)) throw new Error("Los colores deben ser una lista.");
  if (raw.length > MAX_COLORS) throw new Error(`No puede haber más de ${MAX_COLORS} colores.`);
  const names = new Set<string>();
  return raw.map((item, index): CatalogColorDef => {
    if (!isRecord(item)) throw new Error(`Color ${index + 1} inválido.`);
    const name = text(item.name, `El nombre del color ${index + 1}`, MAX_COLOR_NAME);
    const key = normalizeText(name);
    if (names.has(key)) throw new Error(`Ya existe el color "${name}".`);
    names.add(key);
    if (typeof item.hex !== "string" || !COLOR_HEX_PATTERN.test(item.hex)) {
      throw new Error(`El color "${name}" necesita un hex con formato #RRGGBB.`);
    }
    if (typeof item.hidden !== "boolean") {
      throw new Error(`El estado oculto del color "${name}" es inválido.`);
    }
    return { name, hex: item.hex, hidden: item.hidden };
  });
}

function parseCategories(input: unknown): CatalogCategory[] {
  if (!Array.isArray(input)) throw new Error("Las categorías deben ser una lista.");
  if (input.length > MAX_CATEGORIES) {
    throw new Error(`No puede haber más de ${MAX_CATEGORIES} categorías.`);
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  return input.map((item, index): CatalogCategory => {
    if (!isRecord(item)) throw new Error(`Categoría ${index + 1} inválida.`);
    const id = text(item.id, `Id de la categoría ${index + 1}`, MAX_URL);
    if (ids.has(id)) throw new Error(`Id de categoría repetido: ${id}.`);
    ids.add(id);
    const name = text(item.name, `El nombre de la categoría ${index + 1}`, MAX_CATEGORY_NAME);
    const key = normalizeText(name);
    if (names.has(key)) throw new Error(`Ya existe la categoría "${name}".`);
    names.add(key);
    if (typeof item.oneSize !== "boolean") {
      throw new Error(`La talla única de la categoría ${index + 1} es inválida.`);
    }
    return { id, name, oneSize: item.oneSize };
  });
}

type ProductContext = {
  categories: readonly CatalogCategory[];
  colors: readonly { name: string }[];
  imageOk?: ImageCheck;
};

function parseProduct(item: unknown, label: string, ctx: ProductContext): CatalogProduct {
  if (!isRecord(item)) throw new Error(`${label[0].toUpperCase()}${label.slice(1)} inválido.`);
  const colorList = new Set(ctx.colors.map((color) => color.name));
  const imageOk = ctx.imageOk ?? isBlobUrl;
  const id = text(item.id, `Id del ${label}`, MAX_URL);

  const categoryId = item.categoryId ?? null;
  const category =
    categoryId === null ? undefined : ctx.categories.find((candidate) => candidate.id === categoryId);
  if (categoryId !== null && (typeof categoryId !== "string" || !category)) {
    throw new Error(`La categoría del ${label} no existe.`);
  }
  if (typeof item.visible !== "boolean") {
    throw new Error(`La visibilidad del ${label} es inválida.`);
  }
  const sizes = sizesFor(category);

  const { designs } = item;
  if (!Array.isArray(designs) || designs.length < 1) {
    throw new Error(`El ${label} necesita al menos un diseño.`);
  }
  if (designs.length > MAX_DESIGNS) {
    throw new Error(`El ${label} no puede tener más de ${MAX_DESIGNS} diseños.`);
  }
  const designIds = new Set<string>();
  const designNames = new Set<string>();
  const validDesigns = designs.map((design, designIndex): CatalogDesign => {
    const dLabel = `diseño ${designIndex + 1} del ${label}`;
    if (!isRecord(design)) throw new Error(`El ${dLabel} es inválido.`);
    const designId = text(design.id, `El id del ${dLabel}`, MAX_URL);
    if (designIds.has(designId)) throw new Error(`Id de diseño repetido en el ${label}.`);
    designIds.add(designId);
    const designName = text(design.name, `El nombre del ${dLabel}`, MAX_DESIGN_NAME);
    const nameKey = normalizeText(designName);
    if (designNames.has(nameKey)) {
      throw new Error(`El ${label} ya tiene un diseño llamado "${designName}".`);
    }
    designNames.add(nameKey);

    const { image } = design;
    if (typeof image !== "string" || !image) {
      throw new Error(`El ${dLabel} necesita una foto.`);
    }
    if (image.length > MAX_URL) throw new Error(`La URL de la foto del ${dLabel} es demasiado larga.`);
    if (!imageOk(image)) throw new Error(`La foto del ${dLabel} no está en el almacenamiento permitido.`);

    const { colors } = design;
    if (!Array.isArray(colors) || colors.length < 1) {
      throw new Error(`El ${dLabel} necesita al menos un color.`);
    }
    if (colors.length > MAX_DESIGN_COLORS) {
      throw new Error(`El ${dLabel} no puede tener más de ${MAX_DESIGN_COLORS} colores.`);
    }
    const validColors = colors.map((color): CatalogColor => {
      if (typeof color !== "string" || !colorList.has(color)) {
        throw new Error(`El color "${String(color)}" del ${dLabel} no existe en la lista de colores.`);
      }
      return color as CatalogColor;
    });
    if (new Set(validColors).size !== validColors.length) {
      throw new Error(`El ${dLabel} repite un color.`);
    }

    const { stock } = design;
    if (!isRecord(stock)) throw new Error(`El stock del ${dLabel} es inválido.`);
    if (
      Object.keys(stock).length !== validColors.length ||
      !validColors.every((color) => color in stock)
    ) {
      throw new Error(`El stock del ${dLabel} debe tener los colores ${validColors.join(", ")}.`);
    }
    const validStock: DesignStock = Object.fromEntries(
      validColors.map((color) => {
        const row = stock[color];
        if (!isRecord(row)) throw new Error(`El stock del color ${color} del ${dLabel} es inválido.`);
        if (Object.keys(row).length !== sizes.length || !sizes.every((size) => size in row)) {
          throw new Error(
            `El stock del color ${color} del ${dLabel} debe tener las tallas ${sizes.join(", ")}.`,
          );
        }
        return [
          color,
          Object.fromEntries(
            sizes.map((size) => {
              const units = row[size];
              if (
                typeof units !== "number" ||
                !Number.isInteger(units) ||
                units < 0 ||
                units > MAX_STOCK
              ) {
                throw new Error(
                  `El stock de ${color}, talla ${size}, del ${dLabel} debe ser un entero entre 0 y ${MAX_STOCK}.`,
                );
              }
              return [size, units];
            }),
          ),
        ];
      }),
    );
    return { id: designId, name: designName, image, colors: validColors, stock: validStock };
  });

  return {
    id,
    name: text(item.name, `El nombre del ${label}`, MAX_PRODUCT_NAME),
    description:
      item.description === undefined || item.description === null
        ? ""
        : text(item.description, `La descripción del ${label}`, MAX_PRODUCT_DESCRIPTION, true),
    price: price(item.price, `El precio del ${label}`),
    categoryId: categoryId as string | null,
    visible: item.visible,
    designs: validDesigns,
  };
}

export function validateSettings(input: unknown): ValidationResult<CatalogSettingsInput> {
  return guard(() => parseSettings(input));
}

export function validateColors(input: unknown): ValidationResult<CatalogColorDef[]> {
  return guard(() => parseColors(input));
}

export function validateCategories(input: unknown): ValidationResult<CatalogCategory[]> {
  return guard(() => parseCategories(input));
}

// Valida un producto contra las categorías y colores vigentes. No conoce el total de productos:
// el tope MAX_PRODUCTS lo comprueba quien crea (acción) o validateCatalog.
export function validateProduct(
  input: unknown,
  ctx: ProductContext,
): ValidationResult<CatalogProduct> {
  return guard(() => parseProduct(input, "producto", ctx));
}

export function validateCatalog(input: unknown): CatalogValidation {
  try {
    if (!isRecord(input)) throw new Error("Catálogo inválido.");
    const settings = parseSettings(input);
    const categories = parseCategories(input.categories);
    const colors = parseColors(input.colors);

    const { products } = input;
    if (!Array.isArray(products)) throw new Error("Los productos deben ser una lista.");
    if (products.length > MAX_PRODUCTS) {
      throw new Error(`No puede haber más de ${MAX_PRODUCTS} productos.`);
    }
    const productIds = new Set<string>();
    const validProducts = products.map((item, index) => {
      const product = parseProduct(item, `producto ${index + 1}`, { categories, colors });
      if (productIds.has(product.id)) throw new Error(`Id de producto repetido: ${product.id}.`);
      productIds.add(product.id);
      return product;
    });

    return {
      ok: true,
      catalog: { ...settings, categories, colors, products: validProducts },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Catálogo inválido.",
    };
  }
}

