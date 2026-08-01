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
      contract:"temerosa-series-npc-portrait-pack/0.2",packId:"temerosa-series-npcs",version:"0.2.0",
      npcs:[
        {npcId:"temerosa:overture:test",status:"available",sm:{path:"assets/sm/a.webp",emotion:"neutral"},md:{neutral:{path:"assets/md/a.webp",emotion:"neutral"},pleased:{path:"assets/md/a-pleased.webp",emotion:"pleased"}},lg:{path:"assets/lg/a.webp",emotion:"neutral"}},
        {npcId:"temerosa:root2:neutral-only",status:"available",sm:{path:"assets/sm/neutral-only.webp",emotion:"neutral"},md:{neutral:{path:"assets/md/neutral-only.webp",emotion:"neutral"}}},
        {npcId:"temerosa:bestiaization:no-neutral",status:"available",sm:{path:"assets/sm/no-neutral.webp",emotion:"neutral"},md:{pleased:{path:"assets/md/no-neutral-pleased.webp",emotion:"pleased"}}},
        {npcId:"temerosa:root2:mortem",status:"available",sm:{path:"assets/sm/mortem.webp",emotion:"neutral"},md:{neutral:{path:"assets/md/mortem.webp",emotion:"neutral"}}},
        {npcId:"temerosa:finale:missing",status:"unavailable"},
      ],
    }),{status:200}));
    vi.stubGlobal("fetch",fetcher);
    const {loadTemerosaSeriesNpcAssets,resolveTemerosaSeriesNpcPortrait}=await import("./temerosa-content.ts");
    const [first,second]=await Promise.all([loadTemerosaSeriesNpcAssets(),loadTemerosaSeriesNpcAssets()]);
    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/content/temerosa-series-npcs/0.2.0/manifest.json",{cache:"no-store"});
    expect(first.thumbAssets["temerosa:overture:test"]).toBe("/content/temerosa-series-npcs/0.2.0/assets/sm/a.webp");
    expect(first.assets["temerosa:overture:test"]?.neutral).toBe("/content/temerosa-series-npcs/0.2.0/assets/md/a.webp");
    expect(first.unavailableNpcIds).toEqual(["temerosa:finale:missing"]);
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:overture:test","sm")).resolves.toBe("/content/temerosa-series-npcs/0.2.0/assets/sm/a.webp");
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:overture:test","detail")).resolves.toBe("/content/temerosa-series-npcs/0.2.0/assets/lg/a.webp");
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:overture:test",{emotion:"pleased"})).resolves.toBe("/content/temerosa-series-npcs/0.2.0/assets/md/a-pleased.webp");
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:root2:neutral-only",{emotion:"despair"})).resolves.toBe("/content/temerosa-series-npcs/0.2.0/assets/md/neutral-only.webp");
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:bestiaization:no-neutral",{emotion:"tense"})).resolves.toBeUndefined();
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:finale:missing","sm")).resolves.toBeUndefined();
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:finale:test","sm")).resolves.toBeUndefined();
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:overture:mortem","sm")).resolves.toBe("/content/temerosa-series-npcs/0.2.0/assets/sm/mortem.webp");
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:guest:nemo","sm")).resolves.toBe("/content/temerosa-margin/0.8.0/assets/margin/npc-nemo-neutral/sm.webp");
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:guest:nemo",{emotion:"pleased"})).resolves.toBe("/content/temerosa-margin/0.8.0/assets/margin/npc-nemo-neutral/sm.webp");
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

  it("loads Cigenia from the 1.3 supplement without downloading the 0.2 roster pack",async()=>{
    vi.resetModules();
    const fetcher=vi.fn(async(input:string|URL|Request)=>{
      expect(String(input instanceof Request?input.url:input)).toBe("/content/temerosa-series-npcs/0.3.0/manifest.json");
      return new Response(JSON.stringify({
        contract:"temerosa-series-npc-portrait-pack/0.3",packId:"temerosa-series-npcs",version:"0.3.0",
        npcs:[{npcId:"temerosa:finale:cigenia",status:"available",sm:{path:"assets/sm/cigenia.webp",emotion:"neutral"},md:{neutral:{path:"assets/md/cigenia.webp",emotion:"neutral"}},lg:{path:"assets/lg/cigenia.webp",emotion:"neutral"}}],
      }),{status:200});
    });
    vi.stubGlobal("fetch",fetcher);
    const {resolveTemerosaSeriesNpcPortrait}=await import("./temerosa-content.ts");
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:finale:cigenia","sm")).resolves.toBe("/content/temerosa-series-npcs/0.3.0/assets/sm/cigenia.webp");
    await expect(resolveTemerosaSeriesNpcPortrait("temerosa:finale:cigenia","detail")).resolves.toBe("/content/temerosa-series-npcs/0.3.0/assets/lg/cigenia.webp");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects the immutable 0.1 contract at the 0.2 path",async()=>{
    vi.resetModules();
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({
      contract:"temerosa-series-npc-portrait-pack/0.1",packId:"temerosa-series-npcs",version:"0.1.0",npcs:[],
    }),{status:200})));
    const {loadTemerosaSeriesNpcAssets}=await import("./temerosa-content.ts");
    await expect(loadTemerosaSeriesNpcAssets()).rejects.toThrow("temerosa_series_npc_manifest_invalid");
  });
});
