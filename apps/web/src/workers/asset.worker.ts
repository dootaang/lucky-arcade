/// <reference lib="webworker" />
import { BlobBinarySource, openAssetResolver, type AssetResolver } from "@lucky-arcade/card-io";

export type AssetWorkerRequest =
  | { id: number; type: "initialize"; file: File }
  | { id: number; type: "thumbnail"; assetId: string; maxEdge: number };

export type AssetWorkerResponse =
  | { id: number; ok: true; type: "initialized" }
  | { id: number; ok: true; type: "thumbnail"; assetId: string; blob: Blob }
  | { id: number; ok: false; error: string };

const MAX_PIXELS = 40_000_000;
let resolver: AssetResolver | null = null;

self.onmessage = async (event: MessageEvent<AssetWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "initialize") {
      resolver?.dispose();
      resolver = await openAssetResolver(new BlobBinarySource(request.file.name, request.file));
      self.postMessage({ id: request.id, ok: true, type: "initialized" } satisfies AssetWorkerResponse);
      return;
    }
    if (!resolver) throw new Error("asset_worker_not_initialized");
    const resolved = await resolver.read(request.assetId);
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(resolved.bytes)], { type: resolved.mime }));
    if (bitmap.width * bitmap.height > MAX_PIXELS) { bitmap.close(); throw new Error("asset_pixel_count_too_large"); }
    const scale = Math.min(1, request.maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) { bitmap.close(); throw new Error("asset_canvas_unavailable"); }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.86 });
    self.postMessage({ id: request.id, ok: true, type: "thumbnail", assetId: request.assetId, blob } satisfies AssetWorkerResponse);
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : "asset_worker_failed" } satisfies AssetWorkerResponse);
  }
};
