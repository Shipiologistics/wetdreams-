export type CoinPackage = {
  priceInr: number;
  coins: number;
  code: string;
  label: string;
};

export const coinPackages: CoinPackage[] = [
  { priceInr: 50, coins: 45, code: "START45", label: "Starter" },
  { priceInr: 100, coins: 110, code: "BONUS10", label: "Popular" },
  { priceInr: 250, coins: 285, code: "PLUS35", label: "Value" },
  { priceInr: 500, coins: 580, code: "BOOST80", label: "Best deal" },
  { priceInr: 1000, coins: 1200, code: "MEGA200", label: "Max bonus" },
];

export function regularCoinsFor(packageItem: CoinPackage) {
  return packageItem.priceInr;
}
