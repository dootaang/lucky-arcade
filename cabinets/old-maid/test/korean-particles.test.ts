import { describe, expect, it } from "vitest";
import { companionParticle, objectParticle, subjectParticle, topicParticle } from "../src/react/korean-particles.ts";

describe("Korean name particles", () => {
  it("selects particles from the final Hangul syllable", () => {
    expect(`카미유${subjectParticle("카미유")}`).toBe("카미유가");
    expect(`니은${subjectParticle("니은")}`).toBe("니은이");
    expect(`라일라${topicParticle("라일라")}`).toBe("라일라는");
    expect(`페일${objectParticle("페일")}`).toBe("페일을");
    expect(`네모${companionParticle("네모")}`).toBe("네모와");
  });
});
