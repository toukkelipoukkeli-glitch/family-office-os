import { PriceObservation, Provenance, Wine, WineLot } from "./wine";

/**
 * Deterministic, offline fixtures for the wine valuation module. Used by the
 * test suite and safe to import into the UI as sample data. No live API calls,
 * no Liv-ex fetches — these are hand-authored snapshots.
 */

export const wineLafite2010: Wine = Wine.parse({
  id: "wine-lafite-2010",
  producer: "Château Lafite Rothschild",
  vintage: 2010,
  region: "bordeaux",
  currency: "GBP",
});

export const wineDrcRomanee2015: Wine = Wine.parse({
  id: "wine-drc-romanee-2015",
  producer: "Domaine de la Romanée-Conti",
  cuvee: "Romanée-Conti Grand Cru",
  vintage: 2015,
  region: "burgundy",
  currency: "GBP",
});

export const wineKrugNv: Wine = Wine.parse({
  id: "wine-krug-nv",
  producer: "Krug",
  cuvee: "Grande Cuvée",
  vintage: 0,
  region: "champagne",
  currency: "GBP",
});

/** A clean, well-documented in-bond provenance. */
export const provenancePristine: Provenance = Provenance.parse({
  condition: "pristine",
  storage: "in-bond",
  originalWoodenCase: true,
  purchasedOnRelease: true,
  documented: true,
});

/** Reference provenance: factor exactly 1.0, no extra premia. */
export const provenanceReference: Provenance = Provenance.parse({
  condition: "good",
  storage: "private-cellar",
});

/** A weak, undocumented provenance: discount + wide band. */
export const provenanceWeak: Provenance = Provenance.parse({
  condition: "fair",
  storage: "unknown",
});

export const lotLafite: WineLot = WineLot.parse({
  id: "lot-lafite-1",
  wineId: "wine-lafite-2010",
  format: "bottle",
  quantity: 12,
  costPerBottle: "600",
  acquiredOn: "2013-06-01",
  provenance: provenancePristine,
});

export const lotLafiteMagnum: WineLot = WineLot.parse({
  id: "lot-lafite-magnum",
  wineId: "wine-lafite-2010",
  format: "magnum",
  quantity: 3,
  costPerBottle: "1300",
  acquiredOn: "2013-06-01",
  provenance: provenanceReference,
});

export const lotKrug: WineLot = WineLot.parse({
  id: "lot-krug-1",
  wineId: "wine-krug-nv",
  format: "bottle",
  quantity: 24,
  costPerBottle: "120",
  acquiredOn: "2020-12-01",
  provenance: provenanceReference,
});

/**
 * A rising Liv-ex-style price history for the Lafite 2010: base 750 → 1100,
 * with tight, low-dispersion recent quotes.
 */
export const lafiteObservations: PriceObservation[] = [
  PriceObservation.parse({ date: "2021-01-04", pricePerBottle: "750", source: "livex" }),
  PriceObservation.parse({ date: "2021-07-01", pricePerBottle: "820", source: "livex" }),
  PriceObservation.parse({ date: "2022-01-03", pricePerBottle: "900", source: "livex" }),
  PriceObservation.parse({ date: "2022-07-01", pricePerBottle: "980", source: "auction" }),
  PriceObservation.parse({ date: "2023-01-02", pricePerBottle: "1050", source: "livex" }),
  PriceObservation.parse({ date: "2023-07-03", pricePerBottle: "1100", source: "livex" }),
];

/**
 * A noisy, thinly-traded history for the DRC: wide swings → high dispersion →
 * a wide confidence band even with good provenance.
 */
export const drcObservations: PriceObservation[] = [
  PriceObservation.parse({ date: "2022-02-01", pricePerBottle: "14000", source: "auction" }),
  PriceObservation.parse({ date: "2022-09-01", pricePerBottle: "19000", source: "auction" }),
  PriceObservation.parse({ date: "2023-03-01", pricePerBottle: "15500", source: "auction" }),
  PriceObservation.parse({ date: "2023-10-01", pricePerBottle: "21000", source: "auction" }),
];

/** A single Krug NV observation — minimal index, only the volatility floor. */
export const krugObservations: PriceObservation[] = [
  PriceObservation.parse({ date: "2023-06-01", pricePerBottle: "150", source: "merchant" }),
];
