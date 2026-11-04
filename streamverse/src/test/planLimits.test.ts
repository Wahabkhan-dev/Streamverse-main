import { describe, expect, it } from "vitest";
import { describeChanges, describeOffer, type PlanTerms } from "@/lib/planLimits";

const base: PlanTerms = { moviesEnabled: true, ebooksEnabled: true, audiobooksEnabled: false, maxVideoQuality: "720p", maxDevices: 2, maxConcurrentStreams: 1, priceAmount: 499, billingInterval: "MONTHLY", active: true };
const texts = (a: PlanTerms, b: PlanTerms) => describeChanges(a, b).map((c) => c.text);

describe("describeOffer: a plan in plain words", () => {
  it("lists what is unlocked, the video quality, devices and simultaneous streams", () => {
    expect(describeOffer(base).map((l) => l.text)).toEqual([
      "Unlocks movies and eBooks.",
      "Video plays in 720p (HD).",
      "Up to 2 devices signed in at once.",
      "1 movie or audiobook can play at the same time (eBooks don't count).",
    ]);
  });

  it("null limits read as unlimited / best quality", () => {
    const lines = describeOffer({ ...base, maxVideoQuality: null, maxDevices: null, maxConcurrentStreams: null, audiobooksEnabled: true }).map((l) => l.text);
    expect(lines[0]).toBe("Unlocks movies, eBooks and audiobooks.");
    expect(lines[1]).toBe("Video plays in the best quality available.");
    expect(lines[2]).toBe("Any number of devices can be signed in.");
    expect(lines[3]).toBe("Any number of movies or audiobooks can play at the same time.");
  });

  it("flags a plan that unlocks nothing", () => {
    const first = describeOffer({ ...base, moviesEnabled: false, ebooksEnabled: false })[0]!;
    expect(first.ok).toBe(false);
    expect(first.text).toMatch(/pay for nothing/);
  });
});

describe("describeChanges: what an edit does to the people already on the plan", () => {
  it("says nothing when nothing they feel changed", () => {
    expect(describeChanges(base, { ...base })).toEqual([]);
    expect(describeChanges(base, { ...base, active: true })).toEqual([]);
  });

  it("removing a kind of content is immediate access loss; adding one is immediate gain", () => {
    expect(texts(base, { ...base, ebooksEnabled: false })).toEqual(["Customers on this plan lose access to eBooks straight away."]);
    expect(texts(base, { ...base, audiobooksEnabled: true })).toEqual(["Customers on this plan gain access to audiobooks straight away."]);
  });

  it("lowering the video quality caps it from the next play; raising it opens it up", () => {
    expect(texts(base, { ...base, maxVideoQuality: "480p" })[0]).toMatch(/capped at 480p \(SD\) from the next time a customer presses play/);
    expect(texts(base, { ...base, maxVideoQuality: "1080p" })[0]).toMatch(/can watch in 1080p \(Full HD\)/);
    expect(texts(base, { ...base, maxVideoQuality: null })[0]).toMatch(/best quality available/);
  });

  it("lowering devices keeps signed-in devices but refuses new ones", () => {
    const t = texts(base, { ...base, maxDevices: 1 })[0]!;
    expect(t).toMatch(/No new device can be added above 1 device/);
    expect(t).toMatch(/already signed in stay/);
    expect(texts(base, { ...base, maxDevices: null })[0]).toMatch(/any number of devices/);
  });

  it("lowering simultaneous streams refuses the extra stream from the next play", () => {
    expect(texts({ ...base, maxConcurrentStreams: 3 }, { ...base, maxConcurrentStreams: 2 })[0]).toMatch(/only 2 streams can run at the same time/);
  });

  it("a price change does not touch existing customers' price; taking a plan off sale keeps current subscribers", () => {
    const [price] = describeChanges(base, { ...base, priceAmount: 799 });
    expect(price!.text).toMatch(/New price \$7\.99 per month\. Customers already on this plan keep paying their current price/);
    expect(price!.affectsAccess).toBe(false);
    expect(texts(base, { ...base, active: false })[0]).toMatch(/People already on it keep it/);
  });
});
