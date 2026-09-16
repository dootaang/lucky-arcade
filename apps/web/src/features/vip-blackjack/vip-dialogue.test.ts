import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NIEUN_VIP_LINES, VIP_DIALOGUE_HASH } from "./nieun-vip-dialogue.generated.ts";
import { VIP_DOOR_LINES } from "./vip-door-lines.generated.ts";
import { pickVipLine, rememberVipLine, type VipLineEvent } from "./vip-dialogue.ts";

const book = new URL("../../../../../docs/TEMEROSA-VIP-BLACKJACK-NIEUN-DIALOGUE.md", import.meta.url);
describe("VIP dialogue derivative", () => {
  it("keeps 42 event lines plus the three first-entry beats, with frozen content hash", () => {
    expect(NIEUN_VIP_LINES).toHaveLength(45);
    expect(new Set(NIEUN_VIP_LINES.map((line) => line.id)).size).toBe(45);
    expect(createHash("sha256").update(JSON.stringify(NIEUN_VIP_LINES)).digest("hex")).toBe(VIP_DIALOGUE_HASH);
    expect(VIP_DIALOGUE_HASH).toBe("3a6f10d674bc63c7b3206cee4a66256895a239f6536dee0b8513b6f63c7509de");
    expect(VIP_DOOR_LINES).toEqual(NIEUN_VIP_LINES.filter((line) => line.event.startsWith("door-")));
    expect(NIEUN_VIP_LINES.some((line) => /<br|TODO/.test(line.text))).toBe(false);
    expect(NIEUN_VIP_LINES.filter((line) => line.event.startsWith("first-entry"))).toHaveLength(3);
  });
  it.skipIf(!existsSync(book))("matches local approved section 6 verbatim, not the later proposals", () => {
    const section = readFileSync(book, "utf8").split(/^## 6\. /m)[1]!.split(/^## 6-B\./m)[0]!;
    const texts = section.split(/\r?\n/).filter((line) => /^\|\s*(?:`[a-z]|L[123]\s*\|)/.test(line)).map((line) => line.split("|")[2]!.trim().replace(/<br\s*\/?\s*>/gi, "\n"));
    expect(texts).toEqual(NIEUN_VIP_LINES.map((line) => line.text));
  });
  it("uses only event and public seed context, limits each hand to two lines, and never speaks during reveal", () => {
    let memory = { recent: [] as readonly string[], progressUsed: false, outcomeUsed: false };
    const context = () => ({ seed: "one-hand", hand: 1, sequence: 1, memory, force: true });
    const first = pickVipLine("deal", context())!;
    expect(first).not.toBeNull(); memory = rememberVipLine(memory, first);
    expect(pickVipLine("player-hit", context())).toBeNull();
    expect(pickVipLine("dealer-reveal", context())).toBeNull();
    const last = pickVipLine("player-win", context())!;
    expect(last).not.toBeNull(); memory = rememberVipLine(memory, last);
    expect(pickVipLine("house-win", context())).toBeNull();
    memory = { ...memory, progressUsed: false, outcomeUsed: false };
    expect(pickVipLine(first.event as VipLineEvent, context())?.id).not.toBe(first.id);
  });
});
