export interface TokenBudgetItem { tokens?: number; order?: number; }

export function estimateTokens(text: unknown): number {
  const value = String(text ?? "").trim();
  if (!value) return 0;
  const cjk = (value.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) ?? []).length;
  const withoutCjk = value.replace(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g, " ");
  const words = withoutCjk.match(/[A-Za-z0-9_]+(?:[-'][A-Za-z0-9_]+)*/g) ?? [];
  const wordChars = words.reduce((sum, word) => sum + word.length, 0);
  const symbols = Math.max(0, withoutCjk.replace(/\s/g, "").length - wordChars);
  return Math.max(1, Math.ceil(cjk * 0.7 + wordChars / 4 + words.length * 0.25 + symbols / 2));
}

export function applyTokenBudget<T extends TokenBudgetItem>(active: readonly T[], budget: unknown) {
  const limit = Number(budget || 0);
  const sorted = [...active].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!limit || limit <= 0) return { budget: 0, used: sorted.reduce((sum, item) => sum + (item.tokens ?? 0), 0), kept: sorted, dropped: [] as T[] };
  const kept: T[] = [], dropped: T[] = [];
  let used = 0;
  for (const item of sorted) {
    const tokens = item.tokens ?? 0;
    if (used + tokens <= limit) { kept.push(item); used += tokens; }
    else dropped.push(item);
  }
  return { budget: limit, used, kept, dropped };
}
