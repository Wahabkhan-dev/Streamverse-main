import { describe, expect, it } from "vitest";
import { ageRestrictionSchema, territorySchema } from "../../src/validators/content.validator";

describe("ageRestrictionSchema", () => {
  it("ageRestricted=false with no minimumAge is valid, and minimumAge is dropped either way", () => {
    const parsed = ageRestrictionSchema.parse({ ageRestricted: false });
    expect(parsed).toEqual({ ageRestricted: false, minimumAge: undefined });
  });

  it("ageRestricted=true with minimumAge is valid", () => {
    const parsed = ageRestrictionSchema.parse({ ageRestricted: true, minimumAge: 18 });
    expect(parsed).toEqual({ ageRestricted: true, minimumAge: 18 });
  });

  it("ageRestricted=true with NO minimumAge is invalid", () => {
    expect(ageRestrictionSchema.safeParse({ ageRestricted: true }).success).toBe(false);
  });

  it("ageRestricted=false ignores a minimumAge that was sent anyway", () => {
    const parsed = ageRestrictionSchema.parse({ ageRestricted: false, minimumAge: 18 });
    expect(parsed.minimumAge).toBeUndefined();
  });

  it("does not resurrect obsolete per-type age fields", () => {
    expect(ageRestrictionSchema.parse({})).not.toHaveProperty("readingAge");
    expect(ageRestrictionSchema.parse({})).not.toHaveProperty("listenerAge");
  });
});

describe("territorySchema", () => {
  it("WORLDWIDE with no countries is valid", () => {
    expect(territorySchema.safeParse({ mode: "WORLDWIDE", countryCodes: [] }).success).toBe(true);
  });
  it("WORLDWIDE with countries listed is invalid", () => {
    expect(territorySchema.safeParse({ mode: "WORLDWIDE", countryCodes: ["US"] }).success).toBe(false);
  });
  it("INCLUDE/EXCLUDE require at least one country", () => {
    expect(territorySchema.safeParse({ mode: "INCLUDE", countryCodes: [] }).success).toBe(false);
    expect(territorySchema.safeParse({ mode: "EXCLUDE", countryCodes: ["US", "CA"] }).success).toBe(true);
  });
  it("country codes are uppercased", () => {
    expect(territorySchema.parse({ mode: "INCLUDE", countryCodes: ["us", "ca"] }).countryCodes).toEqual(["US", "CA"]);
  });
});
