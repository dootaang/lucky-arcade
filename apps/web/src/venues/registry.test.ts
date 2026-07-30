import { describe, expect, it } from "vitest";
import { getPublicVenue, getVenueForCabinet, listPublicVenues, PUBLIC_CABINET_IDS, PUBLIC_VENUE_IDS } from "./registry.ts";

describe("Venue registry", () => {
  it("publishes one neutral-lobby Venue in stable order", () => {
    expect([...PUBLIC_VENUE_IDS]).toEqual(["temerosa-casino"]);
    expect(listPublicVenues().map((venue) => venue.id)).toEqual(["temerosa-casino"]);
    expect(getPublicVenue("temerosa-casino")?.entryLabel).toBe("카지노 입장");
  });

  it("owns each public cabinet through its Venue manifest", () => {
    expect([...PUBLIC_CABINET_IDS]).toEqual(["temerosa-old-maid", "temerosa-match-pairs", "temerosa-slot", "indian-poker", "temerosa-high-low", "temerosa-five-card-draw"]);
    expect(getVenueForCabinet("temerosa-old-maid")?.title).toBe("테메로세 카지노");
    expect(getVenueForCabinet("temerosa-match-pairs")?.title).toBe("테메로세 카지노");
    expect(getVenueForCabinet("temerosa-slot")?.title).toBe("테메로세 카지노");
    expect(getVenueForCabinet("temerosa-texas-holdem")?.title).toBe("테메로세 카지노");
    expect(getPublicVenue("temerosa-casino")?.tables.filter((table) => table.status === "preparing")).toEqual([]);
    expect(getPublicVenue("temerosa-casino")?.tables.filter((table) => table.status === "admin-preview").map((table) => table.cabinetId)).toEqual([
      "temerosa-blackjack", "temerosa-doubt", "temerosa-one-card", "temerosa-texas-holdem",
      "temerosa-video-poker", "lucky-derby-lab", "temerosa-margin", "temerosa-favorite-cup", "temerosa-echo-memory", "temerosa-pequod-expedition",
    ]);
    expect(getVenueForCabinet("temerosa-favorite-cup")?.title).toBe("테메로세 카지노");
  });

  it("uses only the checked-in responsive derivatives within the home budget", () => {
    const hero = getPublicVenue("temerosa-casino")?.heroImage;
    expect(hero?.sm.src).toMatch(/\/sm\.webp$/);
    expect(hero?.md.src).toMatch(/\/md\.webp$/);
    expect(Math.max(hero?.sm.bytes ?? 0, hero?.md.bytes ?? 0)).toBeLessThanOrEqual(200_000);
  });
});
