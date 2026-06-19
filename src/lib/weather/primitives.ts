import * as z from "zod";

/**
 * Shared primitives for the weather / world-data adapters.
 *
 * READ-ONLY product: these schemas validate and normalize *observations* about
 * the world (weather, macro/world-development indicators). Nothing here moves
 * money, places a trade, or contacts a counterparty.
 *
 * Date/Id primitives that already exist in `src/lib/model/primitives` are
 * re-used rather than duplicated.
 */
export { IsoDate, Id } from "../model/primitives";

/** WGS-84 latitude in decimal degrees, in the inclusive range [-90, 90]. */
export const Latitude = z
  .number()
  .finite()
  .min(-90, "latitude must be >= -90")
  .max(90, "latitude must be <= 90");
export type Latitude = z.infer<typeof Latitude>;

/** WGS-84 longitude in decimal degrees, in the inclusive range [-180, 180]. */
export const Longitude = z
  .number()
  .finite()
  .min(-180, "longitude must be >= -180")
  .max(180, "longitude must be <= 180");
export type Longitude = z.infer<typeof Longitude>;

/** A geographic point. */
export const GeoPoint = z
  .object({
    latitude: Latitude,
    longitude: Longitude,
  })
  .strict();
export type GeoPoint = z.infer<typeof GeoPoint>;

/**
 * An ISO-3166 country/area code as used by the World Bank API. The Bank uses
 * both ISO-3166-1 alpha-2 (e.g. "US") and its own alpha-3 aggregates
 * (e.g. "WLD" for World, "EUU" for the EU), so we accept 2- or 3-letter codes
 * and normalize to uppercase.
 */
export const CountryCode = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^[A-Z]{2,3}$/, "country must be a 2- or 3-letter ISO code"),
  );
export type CountryCode = z.infer<typeof CountryCode>;

/**
 * A finite number that may legitimately be absent in upstream payloads. Both
 * Open-Meteo and the World Bank use JSON `null` for "no observation", which we
 * preserve as `null` rather than coercing to `0` (a real measurement of zero
 * must stay distinguishable from a gap).
 */
export const NullableNumber = z.number().finite().nullable();
export type NullableNumber = z.infer<typeof NullableNumber>;
