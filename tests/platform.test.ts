import { afterEach, describe, expect, it, vi } from "vitest";
import { getPlatformUrl } from "@/lib/platform";

afterEach(() => vi.unstubAllEnvs());

describe("getPlatformUrl()", () => {
  it("es null si la variable no existe", () => {
    vi.stubEnv("PLATFORM_URL", undefined as unknown as string);
    expect(getPlatformUrl()).toBeNull();
  });

  it("es null si está vacía", () => {
    vi.stubEnv("PLATFORM_URL", "  ");
    expect(getPlatformUrl()).toBeNull();
  });

  it("es null sin protocolo", () => {
    vi.stubEnv("PLATFORM_URL", "base-template.com");
    expect(getPlatformUrl()).toBeNull();
  });

  it("rechaza protocolos distintos de http(s)", () => {
    vi.stubEnv("PLATFORM_URL", "javascript:alert(1)");
    expect(getPlatformUrl()).toBeNull();
  });

  it("acepta http://localhost:4200", () => {
    vi.stubEnv("PLATFORM_URL", "http://localhost:4200");
    expect(getPlatformUrl()).toBe("http://localhost:4200/");
  });

  it("normaliza https://x.com/", () => {
    vi.stubEnv("PLATFORM_URL", "https://x.com/");
    expect(getPlatformUrl()).toBe("https://x.com/");
  });
});
