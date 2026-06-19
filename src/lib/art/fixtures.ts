import { Artwork, Comparable } from "./artwork";

/**
 * Deterministic, offline fixtures for the art appraisal model. Used by the
 * test suite and safe to import into the UI as sample data. No live API calls;
 * all comp dates and prices are fixed so appraisals are fully reproducible.
 */

export const artworkRothko: Artwork = Artwork.parse({
  id: "art-rothko-untitled",
  title: "Untitled (Red on Maroon)",
  artist: "Mark Rothko",
  medium: "painting",
  year: 1959,
  dimensions: { heightCm: 266, widthCm: 457 },
  condition: "excellent",
  provenance: "documented",
  acquiredOn: "2014-05-13",
  acquisitionCost: "32000000",
  currency: "USD",
  note: "Color field, oil on canvas.",
});

/**
 * A tight, recent, high-similarity comp set: appraisals from this should be
 * confident (narrow band, lowConfidence = false).
 */
export const tightComps: Comparable[] = [
  Comparable.parse({
    id: "comp-r1",
    price: "44000000",
    currency: "USD",
    soldOn: "2024-05-15",
    similarity: 0.95,
    venue: "Auction House A",
  }),
  Comparable.parse({
    id: "comp-r2",
    price: "46000000",
    currency: "USD",
    soldOn: "2024-11-10",
    similarity: 0.92,
    venue: "Auction House B",
  }),
  Comparable.parse({
    id: "comp-r3",
    price: "43000000",
    currency: "USD",
    soldOn: "2024-02-20",
    similarity: 0.9,
    venue: "Auction House A",
  }),
  Comparable.parse({
    id: "comp-r4",
    price: "45000000",
    currency: "USD",
    soldOn: "2025-01-08",
    similarity: 0.94,
    venue: "Auction House C",
  }),
];

/**
 * A thin, dispersed, stale comp set for the same kind of work: appraisals from
 * this should be honestly uncertain (wide band, lowConfidence = true).
 */
export const thinComps: Comparable[] = [
  Comparable.parse({
    id: "comp-t1",
    price: "20000000",
    currency: "USD",
    soldOn: "2016-06-01",
    similarity: 0.5,
    venue: "Estate sale",
  }),
  Comparable.parse({
    id: "comp-t2",
    price: "60000000",
    currency: "USD",
    soldOn: "2015-03-12",
    similarity: 0.4,
    venue: "Private treaty",
  }),
];

/** A small drawing in poorer condition / weaker provenance. */
export const artworkDrawing: Artwork = Artwork.parse({
  id: "art-drawing-1",
  title: "Study of Hands",
  artist: "Anonymous (attr. workshop)",
  medium: "drawing",
  year: 1620,
  condition: "fair",
  provenance: "weak",
  currency: "EUR",
});

export const drawingComps: Comparable[] = [
  Comparable.parse({
    id: "comp-d1",
    price: "120000",
    currency: "EUR",
    soldOn: "2024-09-01",
    similarity: 0.7,
  }),
  Comparable.parse({
    id: "comp-d2",
    price: "150000",
    currency: "EUR",
    soldOn: "2024-04-18",
    similarity: 0.6,
  }),
  Comparable.parse({
    id: "comp-d3",
    price: "135000",
    currency: "EUR",
    soldOn: "2023-12-02",
    similarity: 0.65,
  }),
];
