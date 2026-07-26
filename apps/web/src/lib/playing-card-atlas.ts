import type { SpriteAtlasManifest } from "@lucky-arcade/contracts";
import type { CourtAtlas } from "@lucky-arcade/ui/playing-card";

const VERSION = "1.0.0";
let manifestPromise: Promise<SpriteAtlasManifest> | null = null;
const atlasPromises = new Map<"sm" | "md", Promise<CourtAtlas>>();

export function loadPlayingCardAtlas(): Promise<CourtAtlas> {
  const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 680px)").matches;
  const highDensity = typeof window !== "undefined" && window.devicePixelRatio > 1.5;
  return loadPlayingCardAtlasSize(narrow && !highDensity ? "sm" : "md");
}

export function loadPlayingCardAtlasSize(size: "sm" | "md"): Promise<CourtAtlas> {
  const pending = atlasPromises.get(size);
  if (pending) return pending;
  const promise = loadManifest().then((manifest) => {
    const sheet = manifest.sheets.find((candidate) => candidate.size === size);
    if (!sheet) throw new Error(`playing_card_sheet_missing:${size}`);
    return {
      url: `/content/playing-cards/${VERSION}/${sheet.path}`,
      cols: manifest.cols,
      cell: sheet.cell,
      gutter: sheet.gutter,
      sheet: { width: sheet.width, height: sheet.height },
      frames: Object.fromEntries(manifest.frames.map((frame) => [frame.id, { col: frame.col, row: frame.row }])),
    } satisfies CourtAtlas;
  });
  atlasPromises.set(size, promise);
  return promise;
}

function loadManifest(): Promise<SpriteAtlasManifest> {
  manifestPromise ??= fetch(`/content/playing-cards/${VERSION}/manifest.json`).then((response) => {
    if (!response.ok) throw new Error("playing_card_manifest_failed");
    return response.json() as Promise<SpriteAtlasManifest>;
  });
  return manifestPromise;
}
