import { describe, expect, it } from "vitest";
import { classifyTemerosaExpressionName, isTemerosaExpressionNameForbidden } from "../src/audit-temerosa-expressions.ts";

describe("Temerosa expression inventory classification", () => {
  it("normalizes named and numbered-card labels without guessing emotion meaning", () => {
    expect(classifyTemerosaExpressionName("Kano_blsuh")).toEqual({ characterId: "kano", expression: "blush" });
    expect(classifyTemerosaExpressionName("Nieun_Pluto.surprised")).toEqual({ characterId: "nieun", expression: "pluto-surprised" });
    expect(classifyTemerosaExpressionName("Trainhead")).toBeNull();
  });

  it("keeps safe candidates separate from adult-name exclusion", () => {
    expect(isTemerosaExpressionNameForbidden("Pale_surprised", "assets/Pale_surprised.png")).toBe(false);
    expect(isTemerosaExpressionNameForbidden("Pale.cowgirl_position", "assets/10.png")).toBe(true);
  });
});
