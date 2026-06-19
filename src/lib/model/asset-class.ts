import * as z from "zod";

/**
 * The asset classes a family office tracks in this product. Covers liquid
 * financial instruments as well as the alternative / collectible holdings a
 * family office cares about (forest land, wine, art, LEGO sets, cars,
 * vineyards, private equity, watches).
 *
 * READ-ONLY product: this enum classifies holdings for reporting; it never
 * authorizes any transaction.
 */
export const ASSET_CLASSES = [
  "equity",
  "bond",
  "etf",
  "cash",
  "crypto",
  "forest",
  "wine",
  "art",
  "lego",
  "car",
  "vineyard",
  "pe",
  "watch",
] as const;

export const AssetClass = z.enum(ASSET_CLASSES);
export type AssetClass = z.infer<typeof AssetClass>;

/**
 * Whether an asset class trades on a liquid public market (so a live price
 * feed is meaningful) or is an illiquid / collectible holding that is normally
 * valued by appraisal. Used by valuation logic to decide confidence defaults.
 */
export const LIQUID_ASSET_CLASSES = new Set<AssetClass>([
  "equity",
  "bond",
  "etf",
  "cash",
  "crypto",
]);

/** True when the asset class trades on a liquid public market. */
export function isLiquidAssetClass(assetClass: AssetClass): boolean {
  return LIQUID_ASSET_CLASSES.has(assetClass);
}

/** True when the asset class is an illiquid / collectible (appraisal-valued) holding. */
export function isCollectibleAssetClass(assetClass: AssetClass): boolean {
  return !LIQUID_ASSET_CLASSES.has(assetClass);
}

/** Human-readable display labels for each {@link AssetClass}. */
export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: "Equities",
  bond: "Bonds",
  etf: "ETFs",
  cash: "Cash",
  crypto: "Crypto",
  forest: "Forest land",
  wine: "Fine wine",
  art: "Art",
  lego: "LEGO sets",
  car: "Classic cars",
  vineyard: "Vineyards",
  pe: "Private equity",
  watch: "Watches",
};

/** Display label for an asset class (falls back to the raw key if unknown). */
export function assetClassLabel(assetClass: AssetClass): string {
  return ASSET_CLASS_LABELS[assetClass] ?? assetClass;
}
