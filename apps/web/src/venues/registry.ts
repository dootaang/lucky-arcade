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
  marquee?: {
    word: string;
    sub: string;
  };
  heroImage: ResponsiveImageRef;
  entryLabel: string;
  order: number;
  tables: readonly VenueTableManifest[];
}

export type VenueTableStatus = "open" | "preparing" | "admin-preview";

export interface VenueTableManifest {
  cabinetId: string;
  status: VenueTableStatus;
}

export const PUBLIC_VENUE_IDS = new Set(["temerosa-casino"]);

const CONTENT_ROOT = "/content/temerosa-casino-venue/0.1.0/assets/venue-temerosa";

const venues: readonly VenueManifest[] = [
  {
    id: "temerosa-casino",
    title: "테메로세 카지노",
    tagline: "여백에 열린 한 판의 항로",
    marquee: { word: "TEMEROSA", sub: "카지노 · CASINO · 여백" },
    heroImage: {
      sm: { src: `${CONTENT_ROOT}/sm.webp`, width: 640, height: 360, bytes: 21_966 },
      md: { src: `${CONTENT_ROOT}/md.webp`, width: 1280, height: 720, bytes: 47_386 },
      alt: "테메로세 카지노 풍경",
    },
    entryLabel: "카지노 입장",
    order: 10,
    tables: [
      { cabinetId: "temerosa-old-maid", status: "open" },
      { cabinetId: "temerosa-match-pairs", status: "open" },
      { cabinetId: "temerosa-slot", status: "open" },
      { cabinetId: "indian-poker", status: "open" },
      { cabinetId: "temerosa-high-low", status: "open" },
      { cabinetId: "temerosa-blackjack", status: "admin-preview" },
      { cabinetId: "temerosa-doubt", status: "admin-preview" },
      { cabinetId: "temerosa-one-card", status: "admin-preview" },
      { cabinetId: "temerosa-texas-holdem", status: "admin-preview" },
      { cabinetId: "temerosa-five-card-draw", status: "admin-preview" },
      { cabinetId: "temerosa-video-poker", status: "admin-preview" },
      { cabinetId: "lucky-derby-lab", status: "admin-preview" },
      { cabinetId: "temerosa-margin", status: "admin-preview" },
      { cabinetId: "gfl-favorite-cup", status: "admin-preview" },
      { cabinetId: "gfl-sprite-memory", status: "admin-preview" },
      { cabinetId: "gfl-ember", status: "admin-preview" },
    ],
  },
] as const;

export const PUBLIC_CABINET_IDS: ReadonlySet<string> = new Set(
  venues.filter((venue) => PUBLIC_VENUE_IDS.has(venue.id)).flatMap((venue) => venue.tables.filter((table) => table.status === "open").map((table) => table.cabinetId)),
);

export function listPublicVenues(): readonly VenueManifest[] {
  return venues.filter((venue) => PUBLIC_VENUE_IDS.has(venue.id)).sort((left, right) => left.order - right.order);
}

export function getPublicVenue(id: string): VenueManifest | undefined {
  return PUBLIC_VENUE_IDS.has(id) ? venues.find((venue) => venue.id === id) : undefined;
}

export function getVenueForCabinet(cabinetId: string): VenueManifest | undefined {
  return venues.find((venue) => venue.tables.some((table) => table.cabinetId === cabinetId));
}

export function getVenueTableForCabinet(cabinetId: string): VenueTableManifest | undefined {
  return venues.flatMap((venue) => venue.tables).find((table) => table.cabinetId === cabinetId);
}
