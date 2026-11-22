import { timingSafeEqual } from "node:crypto";
import { open, seal } from "./crypto";

export const FLOW_COOKIE = "overcity_oidc";
export const FLOW_COOKIE_MAX_AGE = 10 * 60;
const CONTEXT = "oidc-flow";

export interface FlowState {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

export function sealFlow(flow: FlowState, secret: string): string {
  return seal(JSON.stringify(flow), secret, CONTEXT);
}

// null si la cookie falta, está manipulada o no tiene la forma esperada.
export function openFlow(value: string | undefined, secret: string): FlowState | null {
  if (!value) return null;
  const plain = open(value, secret, CONTEXT);
  if (!plain) return null;
  try {
    const flow = JSON.parse(plain) as Partial<FlowState>;
    if (
      typeof flow.state !== "string" ||
      typeof flow.nonce !== "string" ||
      typeof flow.verifier !== "string" ||
      typeof flow.returnTo !== "string"
    ) {
      return null;
    }
    return { state: flow.state, nonce: flow.nonce, verifier: flow.verifier, returnTo: flow.returnTo };
  } catch {
    return null;
  }
}

// Comparación en tiempo constante de dos textos (false si difieren en largo).
export function safeEqualText(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Solo rutas internas bajo /admin: sin `//`, `\`, esquema ni caracteres de control.
export function sanitizeReturnTo(value: string | null | undefined, fallback = "/admin"): string {
  if (!value) return fallback;
  if (value !== "/admin" && !value.startsWith("/admin/") && !value.startsWith("/admin?")) {
    return fallback;
  }
  if (value.includes("//") || value.includes("\\") || value.includes(":")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
