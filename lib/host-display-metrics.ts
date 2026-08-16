const earnedBuckets = [100000, 200000, 300000];

export function getHostEarnedBadge(userId: string) {
  const amount = earnedBuckets[stableHash(userId) % earnedBuckets.length] ?? earnedBuckets[0];
  return `${formatLakhAmount(amount)}+ earned`;
}

function formatLakhAmount(amount: number) {
  return `₹${Math.round(amount / 100000)} lakh`;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
