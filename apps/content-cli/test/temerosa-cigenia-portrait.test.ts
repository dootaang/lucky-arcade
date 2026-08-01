import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const root=fileURLToPath(new URL("../../web/public/content/temerosa-series-npcs/0.3.0/",import.meta.url));

describe("Cigenia 1.3 portrait supplement",()=>{
  it("keeps owner provenance and ships only audited WebP derivatives",async()=>{
    const manifest=JSON.parse(await readFile(`${root}manifest.json`,"utf8"));
    const audit=JSON.parse(await readFile(`${root}audit.json`,"utf8"));
    expect(manifest).toMatchObject({
      contract:"temerosa-series-npc-portrait-pack/0.3",packId:"temerosa-series-npcs",version:"0.3.0",
      totals:{npcs:1,available:1,unavailable:0,imageFiles:3},
      npcs:[{npcId:"temerosa:finale:cigenia",series:"finale",status:"available"}],
    });
    expect(manifest.sources[0]).toMatchObject({
      kind:"owner-supplied-direct-art",
      imageSha256:"ade53b5ec7d412f2e3cc74e99be02c1a6545ffc6f98ad4bf0f030247c5d742e1",
      cardSha256:"dd9b96da9cc26da2aedfa2038cecedbe30111ee71d0e1bb0756750a2c2d98ed9",
      width:1152,height:1728,
    });
    expect(audit).toMatchObject({status:"passed",enlargedVariants:[],crossSeriesFallbacks:[],originalFilesIncluded:[]});
    for(const generated of audit.generatedFiles){
      const bytes=await readFile(`${root}${generated.path}`);
      const metadata=await sharp(bytes).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.width).toBe(generated.width);
      expect(metadata.height).toBe(generated.height);
      expect(metadata.width).toBeLessThanOrEqual(1152);
      expect(metadata.height).toBeLessThanOrEqual(1728);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(generated.sha256);
    }
  });
});
