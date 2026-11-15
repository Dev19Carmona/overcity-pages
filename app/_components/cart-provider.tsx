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

export default function CartProvider({
  catalog,
  children,
}: {
  catalog: CartCatalog;
  children: ReactNode;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<CartToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const products = catalog.products;

  const showToast = useCallback((message: string, action?: { label: string; run: () => void }) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, action });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const dismissToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  // Hidratación tras montar: el primer render coincide con el HTML del servidor (bolsa vacía).
  useEffect(() => {
    const { lines: restored, changed } = reconcileCart(readCart(), products);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(restored);
    setHydrated(true);
    if (changed) {
      showToast("Actualizamos tu bolsa: algunos productos ya no están disponibles.");
    }
  }, [products, showToast]);

  // Persistencia.
  useEffect(() => {
    if (hydrated) writeCart(lines);
  }, [lines, hydrated]);

  // Sincronización entre pestañas.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== CART_KEY && event.key !== null) return;
      setLines(reconcileCart(readCart(), products).lines);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [products]);

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
