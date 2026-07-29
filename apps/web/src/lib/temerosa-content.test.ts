import { afterEach, describe, expect, it, vi } from "vitest";

describe("Temerosa manifest memoization", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests the casino manifest once for repeated floor consumers", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ version: "0.8.0", assets: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json", Date: "Mon, 27 Jul 2026 12:00:00 GMT" },
    }));
    vi.stubGlobal("fetch", fetcher);
    const { loadTemerosaCasinoManifest } = await import("./temerosa-content.ts");
    const [first, second] = await Promise.all([loadTemerosaCasinoManifest(), loadTemerosaCasinoManifest()]);
    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/content/temerosa-margin/0.8.0/manifest.json", { cache: "no-store" });
  });
});
