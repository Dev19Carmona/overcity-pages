"use server";

import { readProducts } from "@/lib/catalog";
import { toCartProduct, type CartProduct } from "@/lib/cart";
import { MAX_CART_LINES, MAX_URL } from "@/lib/content-limits";

// SPEC 12: la bolsa reconcilia pidiendo solo los productos de sus líneas (máximo MAX_CART_LINES).
// Devuelve el resumen de los que siguen visibles, con el stock vigente; los que no vienen ya no existen
// o están ocultos. Es información pública: no exige sesión.
export async function getCartProducts(ids: string[]): Promise<CartProduct[]> {
  if (!Array.isArray(ids)) return [];
  const unique = [
    ...new Set(ids.filter((id): id is string => typeof id === "string" && id.length <= MAX_URL)),
  ].slice(0, MAX_CART_LINES);
  const found = await readProducts(unique, true);
  return found.map(({ product }) => toCartProduct(product));
}
