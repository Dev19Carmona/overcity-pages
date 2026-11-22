import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { startSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { exchangeCode, getJwks, readSsoConfig } from "@/lib/sso/client";
import { FLOW_COOKIE, openFlow, safeEqualText, sanitizeReturnTo } from "@/lib/sso/flow-cookie";
import { verifyAccessToken, verifyIdToken } from "@/lib/sso/tokens";

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}

// Códigos de error visibles; nunca se refleja texto del query ni del IdP.
function fail(code: "access_denied" | "invalid_state" | "session_expired" | "not_configured" | "generic", reason: string) {
  console.warn(`[auth] callback_failed code=${code} reason=${reason}`);
  return redirectTo(`/admin?error=${code}`);
}

// SPEC 13: canjea el código, verifica ID token y access token y abre la sesión.
export async function GET(request: NextRequest) {
  const store = await cookies();
  const flowCookie = store.get(FLOW_COOKIE)?.value;
  store.delete({ name: FLOW_COOKIE, path: "/auth" }); // se borra en cualquier caso

  const config = readSsoConfig();
  if (!config || !getRedis()) return fail("not_configured", "variables o Redis sin configurar");

  const params = request.nextUrl.searchParams;
  if (params.has("error")) {
    return fail(params.get("error") === "access_denied" ? "access_denied" : "generic", "error del IdP");
  }

  const flow = openFlow(flowCookie, config.sessionSecret);
  if (!flow) return fail("session_expired", "cookie de flujo ausente o inválida");

  const state = params.get("state");
  const code = params.get("code");
  if (!state || !safeEqualText(state, flow.state)) return fail("invalid_state", "state distinto");
  if (!code) return fail("generic", "sin code");

  try {
    const tokens = await exchangeCode(config, code, flow.verifier);
    const jwks = getJwks(config);
    if (!tokens.idToken) return fail("generic", "sin id_token");
    const id = await verifyIdToken(tokens.idToken, config, flow.nonce, jwks);
    const claims = await verifyAccessToken(tokens.accessToken, config, jwks);
    if (claims.sub !== id.sub) return fail("generic", "sub distinto entre tokens");
    await startSession({ sub: id.sub, email: id.email, name: id.name, claims, refreshToken: tokens.refreshToken });
  } catch (error) {
    return fail("generic", error instanceof Error ? error.message : "error");
  }

  return redirectTo(sanitizeReturnTo(flow.returnTo));
}
