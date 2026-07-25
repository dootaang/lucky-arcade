import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export * from "./persona.ts";
export * from "./random.ts";

export const ENGINE_VERSION = "arcade-engine/0.1" as const;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function resultHash(value: unknown): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJson(value))));
}

export interface ActionReceipt<Action = unknown> {
  contract: "action-receipt/0.1";
  sequence: number;
  action: Action;
  rngPosition: number;
  previousHash: string;
  resultHash: string;
}

export function makeReceipt<Action>(sequence: number, action: Action, rngPosition: number, previousHash: string, state: unknown): ActionReceipt<Action> {
  return { contract: "action-receipt/0.1", sequence, action, rngPosition, previousHash, resultHash: resultHash(state) };
}
