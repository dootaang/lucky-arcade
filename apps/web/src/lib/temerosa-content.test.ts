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

  it("loads the series portrait pack lazily and memoizes the parsed maps", async()=>{
    vi.resetModules();
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({
      contract:"temerosa-series-npc-portrait-pack/0.1",packId:"temerosa-series-npcs",version:"0.1.0",
      npcs:[
        {npcId:"temerosa:overture:test",status:"available",sm:{path:"assets/sm/a.webp",emotion:"neutral"},md:{neutral:{path:"assets/md/a.webp",emotion:"neutral"}},lg:{path:"assets/lg/a.webp",emotion:"neutral"}},
        {npcId:"temerosa:finale:missing",status:"unavailable"},
      ],
    }),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    const {loadTemerosaSeriesNpcAssets,resolveTemerosaSeriesNpcPortrait}=await import("./temerosa-content.ts");
    const [first,second]=await Promise.all([loadTemerosaSeriesNpcAssets(),loadTemerosaSeriesNpcAssets()]);
    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(first.thumbAssets["temerosa:overture:test"]).toBe("/content/temerosa-series-npcs/0.1.0/assets/sm/a.webp");
    expect(first.assets["temerosa:overture:test"]?.neutral).toBe("/content/temerosa-series-npcs/0.1.0/assets/md/a.webp");
    expect(first.unavailableNpcIds).toEqual(["temerosa:finale:missing"]);
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:overture:test","sm")).resolves.toBe("/content/temerosa-series-npcs/0.1.0/assets/sm/a.webp");
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:overture:test","detail")).resolves.toBe("/content/temerosa-series-npcs/0.1.0/assets/lg/a.webp");
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:finale:missing","sm")).resolves.toBeUndefined();
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:finale:test","sm")).resolves.toBeUndefined();
    await expect(resolveTemerosaSeriesNpcPortrait("pale","sm")).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not fetch the series pack for a legacy 1.1 identity",async()=>{
    vi.resetModules();
    const fetcher=vi.fn();
    vi.stubGlobal("fetch",fetcher);
    const {resolveTemerosaSeriesNpcPortrait}=await import("./temerosa-content.ts");
    await expect(resolveTemerosaSeriesNpcPortrait("pale","sm")).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
