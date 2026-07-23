import { describe, expect, it } from "vitest";
import { sourcedSchema, suitabilityReportSchema } from "../src/index.ts";

describe("runtime contracts", () => {
  it("rejects confidence outside the declared range", () => {
    expect(() => sourcedSchema(suitabilityReportSchema).parse({ value: {}, source: "derived", confidence: 2, evidence: [] })).toThrow();
  });
});
