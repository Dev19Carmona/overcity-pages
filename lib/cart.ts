// Bolsa de compra (SPEC 08). Solo lógica pura y acceso seguro a localStorage; apto para el cliente.
import {
  CATALOG_COLORS,
  formatPrice,
  type CatalogColor,
  type CatalogCurrency,
  type CatalogImage,
} from "@/lib/catalog-shared";
import { MAX_CART_LINES, MAX_STOCK } from "@/lib/content-limits";

export const CART_KEY = "overcity:cart:v1";

export type CartLine = {
  productId: string;
  color: CatalogColor;
  size: string; // una clave de product.stock
  qty: number; // entero 1..stock de esa talla
};

// Resumen del producto que viaja al navegador (sin descripción).
export type CartProduct = {
  id: string;
  name: string;
  price: number | null;
  colors: CatalogColor[];
  images: CatalogImage[];
  stock: Record<string, number>;
};

export type CartCatalog = {
  products: CartProduct[];
  currency: CatalogCurrency;
  whatsapp: string;
  freeShippingFrom: number | null;
  brandName: string;
};

export function lineKey(line: Pick<CartLine, "productId" | "color" | "size">): string {
  return `${line.productId}|${line.color}|${line.size}`;
}

function stockOf(product: CartProduct, size: string): number {
  const units = product.stock[size];
  return typeof units === "number" ? Math.min(units, MAX_STOCK) : 0;
}

export function readCart(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return [];
    const lines = (parsed as { lines?: unknown }).lines;
    if (!Array.isArray(lines)) return [];
    return lines.filter(
      (line): line is CartLine =>
        typeof line === "object" &&
        line !== null &&
        typeof line.productId === "string" &&
        CATALOG_COLORS.includes(line.color) &&
        typeof line.size === "string" &&
        Number.isInteger(line.qty) &&
        line.qty > 0,
    );
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]): void {
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify({ lines }));
  } catch {
    // Sin almacenamiento la bolsa dura mientras la pestaña esté abierta.
  }
}

// Quita líneas de productos que ya no existen o sin ese color/talla o sin stock, recorta las
// cantidades al stock, junta duplicados y respeta el tope de líneas.
export function reconcileCart(
  lines: CartLine[],
  products: CartProduct[],
): { lines: CartLine[]; changed: boolean } {
  const byId = new Map(products.map((product) => [product.id, product]));
  const merged = new Map<string, CartLine>();
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product || !product.colors.includes(line.color)) continue;
    const stock = stockOf(product, line.size);
    if (stock < 1) continue;
    const key = lineKey(line);
    const qty = Math.min((merged.get(key)?.qty ?? 0) + line.qty, stock);
    merged.set(key, { ...line, qty });
  }
  const result = [...merged.values()].slice(0, MAX_CART_LINES);
  const changed =
    result.length !== lines.length ||
    result.some((line, i) => line.qty !== lines[i]?.qty || lineKey(line) !== lineKey(lines[i]));
  return { lines: result, changed };
}

export type CartResult = { lines: CartLine[]; error?: string };

// Suma `line.qty` a la línea existente (sin pasar del stock) o crea una nueva.
export function addLine(lines: CartLine[], line: CartLine, products: CartProduct[]): CartResult {
  const product = products.find((item) => item.id === line.productId);
  if (!product || !product.colors.includes(line.color)) {
    return { lines, error: "Este producto ya no está disponible." };
  }
  const stock = stockOf(product, line.size);
  if (stock < 1) return { lines, error: "Esa talla está agotada." };
  const key = lineKey(line);
  const existing = lines.find((item) => lineKey(item) === key);
  if (!existing && lines.length >= MAX_CART_LINES) {
    return { lines, error: `Tu bolsa admite hasta ${MAX_CART_LINES} productos distintos.` };
  }
  const qty = Math.min((existing?.qty ?? 0) + Math.max(1, line.qty), stock);
  const next = { ...line, qty };
  return {
    lines: existing
      ? lines.map((item) => (lineKey(item) === key ? next : item))
      : [...lines, next],
    error:
      existing && existing.qty + line.qty > stock
        ? `Solo quedan ${stock} unidades de esa talla.`
        : undefined,
  };
}

export function setQty(
  lines: CartLine[],
  key: string,
  qty: number,
  products: CartProduct[],
): CartLine[] {
  return lines.map((line) => {
    if (lineKey(line) !== key) return line;
    const product = products.find((item) => item.id === line.productId);
    const stock = product ? stockOf(product, line.size) : line.qty;
    return { ...line, qty: Math.max(1, Math.min(qty, stock)) };
  });
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((line) => lineKey(line) !== key);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}

export function lineTotal(line: CartLine, products: CartProduct[]): number | null {
  const product = products.find((item) => item.id === line.productId);
  return product && product.price !== null ? product.price * line.qty : null;
}

export function cartSubtotal(lines: CartLine[], products: CartProduct[]): number {
  return lines.reduce((sum, line) => sum + (lineTotal(line, products) ?? 0), 0);
}

// Foto del color elegido; si ese color no tiene fotos, la portada.
export function lineImage(product: CartProduct, color: CatalogColor): CatalogImage | undefined {
  return product.images.find((image) => image.color === color) ?? product.images[0];
}

export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function buildOrderMessage(
  lines: CartLine[],
  catalog: CartCatalog,
  origin: string,
): string {
  const { products, currency, brandName, freeShippingFrom } = catalog;
  const rows = lines.flatMap((line, index) => {
    const product = products.find((item) => item.id === line.productId);
    if (!product) return [];
    const total = lineTotal(line, products);
    return [
      `${index + 1}. ${product.name} — ${line.color}, ${line.size} × ${line.qty} — ${
        total === null ? "Consultar" : formatPrice(total, currency)
      }`,
      `   ${origin}/catalogo/${product.id}`,
    ];
  });
  const subtotal = cartSubtotal(lines, products);
  const unpriced = lines.some((line) => lineTotal(line, products) === null);
  const parts = [
    `Hola ${brandName}, quiero hacer este pedido:`,
    "",
    ...rows,
    "",
    `Subtotal: ${formatPrice(subtotal, currency)}${
      unpriced ? " (sin contar los productos a consultar)" : ""
    }`,
  ];
  if (freeShippingFrom !== null && subtotal >= freeShippingFrom) parts.push("Envío gratis incluido");
  return parts.join("\n");
}

export function buildInquiryMessage(
  product: Pick<CartProduct, "id" | "name">,
  options: { color: CatalogColor | null; size: string | null },
  brandName: string,
  origin: string,
): string {
  const parts = [`Hola ${brandName}, quiero preguntar por ${product.name}`];
  if (options.color) parts.push(`Color: ${options.color}`);
  if (options.size) parts.push(`Talla: ${options.size}`);
  parts.push(`${origin}/catalogo/${product.id}`);
  return parts.join("\n");
}
