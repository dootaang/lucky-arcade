export interface ResponsiveImageVariant {
  src: string;
  width: number;
  height: number;
  bytes: number;
}

export interface ResponsiveImageRef {
  sm: ResponsiveImageVariant;
  md: ResponsiveImageVariant;
  alt: string;
}

export interface VenueManifest {
  id: string;
  title: string;
  tagline: string;
  heroImage: ResponsiveImageRef;
  entryLabel: string;
  order: number;
  cabinetIds: readonly string[];
}

export const PUBLIC_VENUE_IDS = new Set(["temerosa-casino"]);

const CONTENT_ROOT = "/content/temerosa-casino-venue/0.1.0/assets/venue-temerosa";

const venues: readonly VenueManifest[] = [
  {
    id: "temerosa-casino",
    title: "테메로세 카지노",
    tagline: "여백에 열린 한 판의 항로",
    heroImage: {
      sm: { src: `${CONTENT_ROOT}/sm.webp`, width: 640, height: 360, bytes: 21_966 },
      md: { src: `${CONTENT_ROOT}/md.webp`, width: 1280, height: 720, bytes: 47_386 },
      alt: "테메로세 카지노 풍경",
    },
    entryLabel: "카지노 입장",
    order: 10,
    cabinetIds: ["temerosa-old-maid", "temerosa-match-pairs", "temerosa-slot"],
  },
] as const;

export const PUBLIC_CABINET_IDS: ReadonlySet<string> = new Set(
  venues.filter((venue) => PUBLIC_VENUE_IDS.has(venue.id)).flatMap((venue) => venue.cabinetIds),
);

export function listPublicVenues(): readonly VenueManifest[] {
  return venues.filter((venue) => PUBLIC_VENUE_IDS.has(venue.id)).sort((left, right) => left.order - right.order);
}

export function getPublicVenue(id: string): VenueManifest | undefined {
  return PUBLIC_VENUE_IDS.has(id) ? venues.find((venue) => venue.id === id) : undefined;
}

export function getVenueForCabinet(cabinetId: string): VenueManifest | undefined {
  return venues.find((venue) => venue.cabinetIds.includes(cabinetId));
}
