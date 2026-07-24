import { describe, expect, it } from "vitest";
import { classifyTemerosaAppearance } from "../src/temerosa-appearance-passport.ts";

describe("Temerosa appearance passport", () => {
  it("separates Nieun's Bestiaization forms", () => {
    const base = { source: "bestiaization" as const, characterId: "nieun", path: "343.png", width: 1024, height: 1024 };
    expect(classifyTemerosaAppearance({ ...base, expression: "natural" }).appearanceSet).toBe("nieun/bestiaization/information-broker");
    expect(classifyTemerosaAppearance({ ...base, expression: "pluto-natural" }).appearanceSet).toBe("nieun/bestiaization/pluto");
  });

  it("blocks Finale square closeups from automatic scene use", () => {
    const passport = classifyTemerosaAppearance({ source: "finale", characterId: "nieun", expression: "surprised", path: "Nieun_surprised.png", width: 1536, height: 1536 });
    expect(passport.appearanceSet).toBe("nieun/finale/event-horizon-magical-girl");
    expect(passport.visualCluster).toBe("square-closeup-style-drift");
    expect(passport.sceneUse).toBe("blocked");
  });

  it("keeps vertical current regalia reviewable", () => {
    const passport = classifyTemerosaAppearance({ source: "finale", characterId: "nieun", expression: "standing", path: "Nieun_standing.png", width: 896, height: 1800 });
    expect(passport.wardrobe).toBe("black-wedding-dress-white-frill-yellow-rings");
    expect(passport.visualCluster).toBe("vertical-black-regalia");
    expect(passport.sceneUse).toBe("review-required");
  });
});
