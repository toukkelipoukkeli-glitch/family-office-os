/**
 * Fine-wine valuation for the read-only family office OS.
 *
 *  - {@link Wine} / {@link WineLot} / {@link Provenance} — domain schemas.
 *  - {@link buildWineIndex} — a Liv-ex-style price index from market quotes.
 *  - {@link provenanceFactor} / {@link provenanceUncertainty} — provenance
 *    premium/discount and band-widening uncertainty.
 *  - {@link valueLot} / {@link valueLotWithIndex} / {@link valueCellar} — the
 *    valuation engine producing a point estimate + confidence band.
 *
 * Nothing here moves a bottle or money; it only models and *reports* value.
 */
export {
  Wine,
  WineLot,
  Provenance,
  PriceObservation,
  BottleFormat,
  WineRegion,
  ConditionGrade,
  StorageHistory,
  BOTTLE_FORMATS,
  WINE_REGIONS,
  CONDITION_GRADES,
  STORAGE_HISTORIES,
  FORMAT_VOLUME_RATIO,
  wineKey,
  type PricePerBottle,
} from "./wine";

export {
  buildWineIndex,
  INDEX_BASE,
  type WineIndex,
  type IndexPoint,
} from "./index-series";

export { provenanceFactor, provenanceUncertainty } from "./provenance";

export {
  valueLot,
  valueLotWithIndex,
  valueCellar,
  DEFAULT_CONFIDENCE_Z,
  type ValuationOptions,
  type WineValuation,
  type CellarValuation,
} from "./valuation";
