import { ClassicCar, type ComparableSale } from "./vehicle";

/**
 * Deterministic, offline fixtures for classic-car valuation tests and demos.
 * Numbers are illustrative, not live market data (AGENTS.md: fixtures only,
 * never live APIs in tests).
 */

/** A 1973 Porsche 911 Carrera RS — well-documented, with auction comps. */
export const porsche911RS: ClassicCar = ClassicCar.parse({
  id: "car-porsche-911rs-1973",
  make: "Porsche",
  model: "911 Carrera RS 2.7",
  year: 1973,
  currency: "USD",
  baselineValue: "800000",
  baselineMileage: 60000,
  conditionGrade: "excellent",
  mileage: 42000,
  provenanceFactor: "1.1", // matching-numbers, documented history
  rarityFactor: "1.15", // lightweight spec, low production
  comps: [
    {
      id: "comp-rs-1",
      price: "950000",
      currency: "USD",
      soldOn: "2025-08-15",
      conditionGrade: "excellent",
      mileage: 38000,
      venue: "Monterey",
    },
    {
      id: "comp-rs-2",
      price: "1020000",
      currency: "USD",
      soldOn: "2025-05-20",
      conditionGrade: "concours",
      mileage: 12000,
      venue: "Amelia Island",
    },
    {
      id: "comp-rs-3",
      price: "880000",
      currency: "USD",
      soldOn: "2025-03-02",
      conditionGrade: "good",
      mileage: 71000,
    },
    {
      id: "comp-rs-4",
      price: "905000",
      currency: "USD",
      soldOn: "2024-11-10",
      conditionGrade: "excellent",
      mileage: 49000,
    },
  ],
});

/** A 1965 Jaguar E-Type project car — no comps, fair condition. */
export const jaguarEType: ClassicCar = ClassicCar.parse({
  id: "car-jaguar-etype-1965",
  make: "Jaguar",
  model: "E-Type Series 1",
  year: 1965,
  currency: "GBP",
  baselineValue: "120000",
  conditionGrade: "fair",
  mileage: 88000,
});

/** A high-mileage driver-grade Mercedes 280SL with a couple of comps. */
export const mercedes280SL: ClassicCar = ClassicCar.parse({
  id: "car-mercedes-280sl-1970",
  make: "Mercedes-Benz",
  model: "280SL Pagoda",
  year: 1970,
  currency: "EUR",
  baselineValue: "140000",
  baselineMileage: 80000,
  conditionGrade: "good",
  mileage: 130000,
  comps: [
    {
      id: "comp-sl-1",
      price: "150000",
      currency: "EUR",
      soldOn: "2025-06-01",
      conditionGrade: "good",
      mileage: 95000,
    },
    {
      id: "comp-sl-2",
      price: "175000",
      currency: "EUR",
      soldOn: "2025-02-14",
      conditionGrade: "excellent",
      mileage: 60000,
    },
  ],
});

/** All sample vehicles. */
export const sampleCars: ClassicCar[] = [
  porsche911RS,
  jaguarEType,
  mercedes280SL,
];

/** A standalone comp for unit tests. */
export const sampleComp: ComparableSale = porsche911RS.comps[0];
