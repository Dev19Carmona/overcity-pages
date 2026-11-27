import { describe, expect, it } from "vitest";
import { MAX_ORDER_LINES, MAX_PROOF_BYTES } from "@/lib/content-limits";
import {
  displayStatus,
  formatDateTime,
  formatOrderNumber,
  mergeLines,
  orderSubtotal,
  orderTotal,
  reservedStockMessage,
  statusLabel,
} from "@/lib/orders-shared";
import {
  proofFileName,
  validateHours,
  validateOrder,
  validatePayment,
  validateProofUpload,
  validateRequestLines,
  validateVoidReason,
} from "@/lib/orders-validate";

const ID = "3f2b8c1e-9a4d-4e7b-8c2a-1f5e6d7c8b9a";

const line = (extra: Record<string, unknown> = {}) => ({
  productId: "p1",
  designId: "d1",
  color: "Negro",
  size: "M",
  qty: 2,
  unitPrice: 50_000,
  ...extra,
});

const order = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  requestCode: null,
  customerName: "",
  customerPhone: "",
  customerAddress: "",
  note: "",
  discount: 0,
  shipping: 0,
  lines: [line()],
  ...extra,
});

describe("totales", () => {
  const lines = [line(), line({ size: "L", qty: 1, unitPrice: null })];

  it("el subtotal suma solo las líneas con precio", () => {
    expect(orderSubtotal(lines)).toBe(100_000);
  });

  it("total = subtotal − descuento + envío", () => {
    expect(orderTotal(lines, { discount: 10_000, shipping: 12_000 })).toBe(102_000);
  });

  it("junta las combinaciones repetidas sumando cantidades, con tope", () => {
    const merged = mergeLines([line(), line({ qty: 3, unitPrice: 1 }), line({ size: "L" })]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ qty: 5, unitPrice: 50_000 });
    expect(mergeLines([line({ qty: 9000 }), line({ qty: 9000 })])[0].qty).toBe(9999);
  });
});

describe("estado derivado", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  const open = (frozenUntil: string | null) => ({ status: "abierto" as const, frozenUntil });

  it("abierto, congelado y vencido", () => {
    expect(displayStatus(open(null), now)).toBe("abierto");
    expect(displayStatus(open("2026-11-26T17:00:00Z"), now)).toBe("congelado");
    expect(displayStatus(open("2026-11-26T11:59:59Z"), now)).toBe("vencido");
    expect(displayStatus(open("2026-11-26T12:00:00Z"), now)).toBe("vencido");
    expect(displayStatus({ status: "vendido", frozenUntil: null }, now)).toBe("vendido");
  });

  it("etiquetas", () => {
    expect(statusLabel(open("2026-11-26T17:00:00Z"), now)).toBe("Congelado · vence en 5 h");
    expect(statusLabel(open("2026-11-26T12:20:00Z"), now)).toBe("Congelado · vence en 20 min");
    expect(statusLabel(open("2026-12-03T12:00:00Z"), now)).toBe("Congelado · vence en 7 días");
    expect(statusLabel(open("2026-11-25T12:00:00Z"), now)).toBe("Congelamiento vencido");
    expect(statusLabel({ status: "anulado", frozenUntil: null }, now)).toBe("Anulado");
  });

  it("número y fecha en hora de Bogotá", () => {
    expect(formatOrderNumber(1)).toBe("#0001");
    expect(formatOrderNumber(12345)).toBe("#12345");
    expect(formatDateTime("2026-11-27T03:05:00Z")).toBe("26/11/2026 22:05");
  });

  it("mensaje de stock reservado", () => {
    expect(reservedStockMessage([12, 15])).toBe(
      "No se puede guardar: hay unidades reservadas en los pedidos #0012 y #0015. Libéralos o ajústalos primero.",
    );
    expect(reservedStockMessage([1, 2, 3])).toContain("#0001, #0002 y #0003");
    expect(reservedStockMessage([7])).toContain("en el pedido #0007. Libéralo");
  });
});

describe("validateOrder()", () => {
  it("acepta un pedido mínimo y descarta nombres y fotos del navegador", () => {
    const result = validateOrder(
      order({ lines: [line({ productName: "Falso", designName: "x", image: "http://x" })] }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.lines[0]).toEqual(line());
  });

  it("rechaza un descuento mayor que el subtotal", () => {
    expect(validateOrder(order({ discount: 100_000 })).ok).toBe(true);
    expect(validateOrder(order({ discount: 100_001 }))).toEqual({
      ok: false,
      error: "El descuento no puede ser mayor que el subtotal.",
    });
  });

  it.each([
    ["sin líneas", { lines: [] }],
    ["cantidad 0", { lines: [line({ qty: 0 })] }],
    ["cantidad decimal", { lines: [line({ qty: 1.5 })] }],
    ["cantidad excesiva", { lines: [line({ qty: 10_000 })] }],
    ["precio negativo", { lines: [line({ unitPrice: -1 })] }],
    ["envío negativo", { shipping: -1 }],
    ["descuento no numérico", { discount: "10" }],
    ["id inválido", { id: "1" }],
    ["código inválido", { requestCode: "OC-0OIL1" }],
    ["nombre largo", { customerName: "a".repeat(81) }],
    ["teléfono largo", { customerPhone: "1".repeat(21) }],
    ["nota larga", { note: "a".repeat(501) }],
  ])("rechaza: %s", (_name, extra) => {
    expect(validateOrder(order(extra)).ok).toBe(false);
  });

  it(`admite hasta ${MAX_ORDER_LINES} líneas distintas`, () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => line({ productId: `p${index}` }));
    expect(validateOrder(order({ lines: many(MAX_ORDER_LINES) })).ok).toBe(true);
    expect(validateOrder(order({ lines: many(MAX_ORDER_LINES + 1) })).ok).toBe(false);
  });
});

describe("plazo, pago, motivo y comprobante", () => {
  it("plazo entero de 1 a 720", () => {
    for (const value of [1, 48, 720]) expect(validateHours(value).ok).toBe(true);
    for (const value of [0, 721, 1.5, "48", null]) expect(validateHours(value).ok).toBe(false);
  });

  it("método de pago obligatorio; efectivo no lleva comprobante", () => {
    expect(validatePayment({ method: "efectivo" }).ok).toBe(true);
    expect(validatePayment({ note: "x" }).ok).toBe(false);
    expect(validatePayment({ method: "cheque" }).ok).toBe(false);
    expect(validatePayment({ method: "efectivo", proofPath: "proofs/x/y.png" }).ok).toBe(false);
    expect(validatePayment({ method: "tarjeta", note: "a".repeat(201) }).ok).toBe(false);
  });

  it("motivo obligatorio", () => {
    expect(validateVoidReason("  ").ok).toBe(false);
    expect(validateVoidReason("a".repeat(201)).ok).toBe(false);
    expect(validateVoidReason(" error ")).toEqual({ ok: true, value: "error" });
  });

  it("solo PNG, JPG o WebP de hasta 5 MB", () => {
    const upload = (contentType: string, size: number) =>
      validateProofUpload({ orderId: ID, contentType, size }).ok;
    expect(upload("image/png", MAX_PROOF_BYTES)).toBe(true);
    expect(upload("image/webp", 1)).toBe(true);
    expect(upload("image/png", MAX_PROOF_BYTES + 1)).toBe(false);
    expect(upload("application/pdf", 10)).toBe(false);
    expect(validateProofUpload({ orderId: "../x", contentType: "image/png", size: 1 }).ok).toBe(false);
  });

  it("solo acepta una ruta del propio pedido", () => {
    const file = `${ID}.png`;
    expect(proofFileName(ID, `proofs/${ID}/${file}`)).toBe(file);
    expect(proofFileName(ID, `proofs/otro/${file}`)).toBeNull();
    expect(proofFileName(ID, `proofs/${ID}/../otro/${file}`)).toBeNull();
    expect(proofFileName(ID, `proofs/${ID}/x.pdf`)).toBeNull();
  });
});

describe("validateRequestLines()", () => {
  it("acepta hasta 30 líneas y quita precios y nombres", () => {
    const result = validateRequestLines([line({ productName: "Falso" })]);
    expect(result).toEqual({
      ok: true,
      value: [{ productId: "p1", designId: "d1", color: "Negro", size: "M", qty: 2 }],
    });
  });

  it("rechaza más de 30 líneas y cantidades inválidas", () => {
    const many = Array.from({ length: 31 }, (_, index) => line({ productId: `p${index}` }));
    expect(validateRequestLines(many).ok).toBe(false);
    expect(validateRequestLines([]).ok).toBe(false);
    expect(validateRequestLines([line({ qty: 0 })]).ok).toBe(false);
    expect(validateRequestLines("x").ok).toBe(false);
  });
});
