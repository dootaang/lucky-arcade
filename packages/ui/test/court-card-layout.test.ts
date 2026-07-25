import { describe, expect, it } from "vitest";
import { courtCardLabel, courtCardStyle, type CourtAtlas } from "../src/court-card.tsx";

const atlas: CourtAtlas = { url: "/cards.webp", cols: 4, cell: { w: 112, h: 172 }, gutter: 4, sheet: { width: 460, height: 700 }, frames: { "hearts-q": { col: 1, row: 1 }, joker: { col: 0, row: 3 } } };
describe("court card atlas layout", () => {
  it("uses pixel pitch and scales offsets", () => { expect(courtCardStyle(atlas, "hearts-q")).toMatchObject({ width: 112, height: 172, backgroundPosition: "-116px -176px" }); expect(courtCardStyle(atlas, "hearts-q", 0.5)).toMatchObject({ width: 56, height: 86, backgroundPosition: "-58px -88px" }); });
  it("provides Korean labels", () => { expect(courtCardLabel("hearts-q")).toBe("하트 Q"); expect(courtCardLabel("joker")).toBe("조커"); });
});
