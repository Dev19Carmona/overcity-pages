import { cookies } from "next/headers";
import { connection, type NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";
import { buildAuthorizeUrl, readSsoConfig } from "@/lib/sso/client";
import { FLOW_COOKIE, FLOW_COOKIE_MAX_AGE, sanitizeReturnTo, sealFlow } from "@/lib/sso/flow-cookie";
import { createCodeVerifier, randomToken } from "@/lib/sso/pkce";

// Redirección relativa: no depende de la cabecera Host.
function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}

// SPEC 13: inicia Authorization Code + PKCE. Guarda state, nonce y verifier en una cookie cifrada.
export async function GET(request: NextRequest) {
  // Nunca se prerrenderiza: state, nonce y verifier deben ser distintos en cada petición.
  await connection();
  const config = readSsoConfig();
  if (!config || !getRedis()) return redirectTo("/admin?error=not_configured");

  const state = randomToken(32);
  const nonce = randomToken(32);
  const verifier = createCodeVerifier();
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));

  (await cookies()).set(FLOW_COOKIE, sealFlow({ state, nonce, verifier, returnTo }, config.sessionSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth",
    maxAge: FLOW_COOKIE_MAX_AGE,
  });

  return redirectTo(buildAuthorizeUrl(config, { state, nonce, verifier }));
}
