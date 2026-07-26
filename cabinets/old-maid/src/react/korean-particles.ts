type ParticlePair = readonly [withBatchim: string, withoutBatchim: string];

export function particle(value: string, [withBatchim, withoutBatchim]: ParticlePair): string {
  const code = value.charCodeAt(value.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? withBatchim : withoutBatchim;
}

export function subjectParticle(value: string): string { return particle(value, ["이", "가"]); }
export function topicParticle(value: string): string { return particle(value, ["은", "는"]); }
export function objectParticle(value: string): string { return particle(value, ["을", "를"]); }
export function companionParticle(value: string): string { return particle(value, ["과", "와"]); }
