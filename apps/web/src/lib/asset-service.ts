import type { AssetWorkerRequest, AssetWorkerResponse } from "../workers/asset.worker.ts";

const MAX_URLS = 32;
type AssetWorkerInput =
  | { type: "initialize"; file: File }
  | { type: "thumbnail"; assetId: string; maxEdge: number };
type AssetWorkerSuccess = Extract<AssetWorkerResponse, { ok: true }>;

export class CardAssetService {
  readonly #worker = new Worker(new URL("../workers/asset.worker.ts", import.meta.url), { type: "module" });
  readonly #pending = new Map<number, { resolve(value: AssetWorkerSuccess): void; reject(reason: Error): void }>();
  readonly #urls = new Map<string, string>();
  #requestId = 0;
  #ready: Promise<void>;

  constructor(file: File) {
    this.#worker.onmessage = (event: MessageEvent<AssetWorkerResponse>) => {
      const pending = this.#pending.get(event.data.id);
      if (!pending) return;
      this.#pending.delete(event.data.id);
      if (event.data.ok) pending.resolve(event.data);
      else pending.reject(new Error(event.data.error));
    };
    this.#worker.onerror = () => this.#failAll(new Error("asset_worker_failed"));
    this.#ready = this.#send({ type: "initialize", file }).then(() => undefined);
  }

  async thumbnailUrl(assetId: string, maxEdge = 512): Promise<string> {
    await this.#ready;
    const key = `${assetId}:${maxEdge}`;
    const cached = this.#urls.get(key);
    if (cached) { this.#urls.delete(key); this.#urls.set(key, cached); return cached; }
    const response = await this.#send({ type: "thumbnail", assetId, maxEdge });
    if (response.type !== "thumbnail") throw new Error("asset_thumbnail_response_invalid");
    const url = URL.createObjectURL(response.blob);
    this.#urls.set(key, url);
    this.#trim();
    return url;
  }

  dispose(): void {
    this.#worker.terminate();
    this.#failAll(new Error("asset_service_disposed"));
    for (const url of this.#urls.values()) URL.revokeObjectURL(url);
    this.#urls.clear();
  }

  #send(request: AssetWorkerInput): Promise<AssetWorkerSuccess> {
    const id = ++this.#requestId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker.postMessage({ ...request, id } as AssetWorkerRequest);
    });
  }

  #trim(): void {
    while (this.#urls.size > MAX_URLS) {
      const oldest = this.#urls.entries().next().value as [string, string] | undefined;
      if (!oldest) return;
      URL.revokeObjectURL(oldest[1]);
      this.#urls.delete(oldest[0]);
    }
  }

  #failAll(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}
