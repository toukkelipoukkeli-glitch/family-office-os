/**
 * Weather / world-data adapters for the read-only family office OS.
 *
 * - Open-Meteo (weather): keyless current conditions, daily forecast, and
 *   historical archive.
 * - World Bank (world data): keyless development indicators (GDP, population,
 *   inflation, ...).
 *
 * All response parsing is pure and fixture-tested offline; the only network
 * seam is {@link WeatherWorldClient}'s injectable `fetch`.
 */
export * from "./primitives";
export * from "./open-meteo";
export * from "./world-bank";
export * from "./client";
