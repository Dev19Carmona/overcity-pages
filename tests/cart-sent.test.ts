import { describe, expect, it } from "vitest";
import type { CartLine } from "@/lib/cart";
import { onlyHasSentItems } from "@/lib/cart-sent";

const line: CartLine = { productId: "p", designId: "d", color: "Blanco", size: "S", qty: 2 };
const sent = { lines: [line], at: 0 };

describe("onlyHasSentItems", () => {
  it("pregunta si la bolsa es la enviada o parte de ella", () => {
    expect(onlyHasSentItems([line], sent)).toBe(true);
    expect(onlyHasSentItems([{ ...line, qty: 1 }], sent)).toBe(true);
  });

  it("no pregunta si la bolsa está vacía o tiene algo que no se envió", () => {
    expect(onlyHasSentItems([], sent)).toBe(false);
    expect(onlyHasSentItems([{ ...line, qty: 3 }], sent)).toBe(false);
    expect(onlyHasSentItems([line, { ...line, size: "M" }], sent)).toBe(false);
  });
});
