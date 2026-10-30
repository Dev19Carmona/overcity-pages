import "server-only";
import { Redis } from "@upstash/redis";

let client: Redis | null = null;

// null si las variables de Upstash no están configuradas.
export function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  client ??= new Redis({ url, token });
  return client;
}
