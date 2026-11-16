"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getCartProducts } from "@/app/_actions/cart";
import {
  addLine,
  CART_KEY,
  cartCount,
  lineKey,
  readCart,
  reconcileCart,
  removeLine,
  setQty as setLineQty,
  writeCart,
  type CartCatalog,
  type CartLine,
  type CartProduct,
  type CartShell,
} from "@/lib/cart";

export type CartToastState = {
  message: string;
  action?: { label: string; run: () => void };
} | null;

type CartContextValue = {
  catalog: CartCatalog;
  lines: CartLine[];
  count: number;
  open: boolean;
  openCart: () => void;
  closeCart: () => void;
  // Devuelve un texto si no se pudo agregar (o se recortó al stock).
  add: (line: CartLine) => string | undefined;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  toast: CartToastState;
  dismissToast: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart debe usarse dentro de CartProvider.");
  return value;
}

const TOAST_MS = 6000;
const NO_PRODUCTS: CartProduct[] = [];

// SPEC 12: el proveedor ya no recibe el catálogo. `shell` trae lo fijo (colores, moneda, WhatsApp,
// envío gratis) y `pageProducts` el producto de la página abierta, para poder agregarlo de inmediato.
// Al montar y al cambiar la bolsa en otra pestaña, pide al servidor solo los productos de las líneas.
export default function CartProvider({
  shell,
  pageProducts = NO_PRODUCTS,
  children,
}: {
  shell: CartShell;
  pageProducts?: CartProduct[];
  children: ReactNode;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [products, setProducts] = useState<CartProduct[]>(pageProducts);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<CartToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageProductsRef = useRef(pageProducts);
  const syncId = useRef(0);

  const showToast = useCallback((message: string, action?: { label: string; run: () => void }) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, action });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const dismissToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  // Trae del servidor los productos de `raw` y reconcilia la bolsa. Con varias llamadas seguidas
  // solo vale la última. Si el servidor no responde, la bolsa se queda como estaba guardada.
  const sync = useCallback(
    async (raw: CartLine[], announce: boolean) => {
      const id = ++syncId.current;
      const ids = [...new Set(raw.map((line) => line.productId))];
      let merged = new Map(pageProductsRef.current.map((product) => [product.id, product]));
      if (ids.length > 0) {
        let fresh: CartProduct[];
        try {
          fresh = await getCartProducts(ids);
        } catch {
          if (id !== syncId.current) return;
          setHydrated(true);
          if (announce) showToast("No pudimos actualizar tu bolsa. Revisa tu conexión.");
          return;
        }
        if (id !== syncId.current) return;
        const freshIds = new Set(fresh.map((product) => product.id));
        merged = new Map([...merged].filter(([key]) => freshIds.has(key) || !ids.includes(key)));
        for (const product of fresh) merged.set(product.id, product);
      }
      const list = [...merged.values()];
      const { lines: restored, changed } = reconcileCart(raw, list);
      setProducts(list);
      setLines(restored);
      setHydrated(true);
      if (changed && announce) {
        showToast("Actualizamos tu bolsa: algunos productos ya no están disponibles.");
      }
    },
    [showToast],
  );

  // Hidratación tras montar: el primer render coincide con el HTML del servidor (bolsa vacía).
  useEffect(() => {
    const raw = readCart();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(raw);
    void sync(raw, true);
  }, [sync]);

  // Persistencia.
  useEffect(() => {
    if (hydrated) writeCart(lines);
  }, [lines, hydrated]);

  // Sincronización entre pestañas.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== CART_KEY && event.key !== null) return;
      const raw = readCart();
      setLines(raw);
      void sync(raw, false);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [sync]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const openCart = useCallback(() => setOpen(true), []);
  const closeCart = useCallback(() => setOpen(false), []);

  const add = useCallback(
    (line: CartLine) => {
      const result = addLine(lines, line, products);
      if (result.lines !== lines) setLines(result.lines);
      if (result.error) showToast(result.error);
      return result.error;
    },
    [lines, products, showToast],
  );

  const setQty = useCallback(
    (key: string, qty: number) => setLines((current) => setLineQty(current, key, qty, products)),
    [products],
  );

  const remove = useCallback(
    (key: string) => {
      const index = lines.findIndex((line) => lineKey(line) === key);
      if (index < 0) return;
      const removed = lines[index];
      setLines(removeLine(lines, key));
      showToast("Prenda quitada", {
        label: "Deshacer",
        run: () =>
          setLines((current) => {
            if (current.some((line) => lineKey(line) === key)) return current;
            const next = [...current];
            next.splice(Math.min(index, next.length), 0, removed);
            return next;
          }),
      });
    },
    [lines, showToast],
  );

  const catalog = useMemo<CartCatalog>(() => ({ ...shell, products }), [shell, products]);

  const value = useMemo<CartContextValue>(
    () => ({
      catalog,
      lines,
      count: cartCount(lines),
      open,
      openCart,
      closeCart,
      add,
      setQty,
      remove,
      toast,
      dismissToast,
    }),
    [catalog, lines, open, openCart, closeCart, add, setQty, remove, toast, dismissToast],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
