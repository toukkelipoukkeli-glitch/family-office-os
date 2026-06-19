import { Company } from "./company";
import { OwnershipStake } from "./ownership-stake";
import { Person } from "./person";

/**
 * Deterministic, offline fixtures for the company/ownership model. Used by the
 * test suite and safe to import into UI as sample data. No live API calls.
 */

export const personTouko: Person = Person.parse({
  id: "person-touko",
  name: "Touko Ursin",
  dateOfBirth: "1980-05-01",
  countryOfResidence: "fi",
  email: "touko@example.com",
  note: "Principal",
  tags: ["family", "principal"],
});

export const personMaria: Person = Person.parse({
  id: "person-maria",
  name: "Maria Ursin",
  countryOfResidence: "FI",
  tags: ["family"],
});

export const stakeToukoTopco: OwnershipStake = OwnershipStake.parse({
  id: "stake-touko-topco",
  ownerType: "person",
  ownerId: "person-touko",
  percentage: "60",
  shareClass: "voting",
});

export const stakeMariaTopco: OwnershipStake = OwnershipStake.parse({
  id: "stake-maria-topco",
  ownerType: "person",
  ownerId: "person-maria",
  percentage: "40",
  shareClass: "non_voting",
});

/** Top holding company, 60/40 owned by Touko/Maria. Owns two subsidiaries. */
export const topco: Company = Company.parse({
  id: "co-topco",
  name: "Ursin Holdings Oy",
  entityType: "holding_company",
  jurisdiction: "FI",
  currency: "EUR",
  registrationNumber: "1234567-8",
  incorporatedOn: "2005-03-15",
  owners: [stakeToukoTopco, stakeMariaTopco],
  subsidiaries: [
    { id: "sub-realestate", companyId: "co-realestate", percentage: "100" },
    { id: "sub-ventures", companyId: "co-ventures", percentage: "75" },
  ],
  tags: ["topco"],
});

/** Wholly owned real-estate sub. */
export const realEstateCo: Company = Company.parse({
  id: "co-realestate",
  name: "Ursin Real Estate Oy",
  entityType: "corporation",
  jurisdiction: "FI",
  currency: "EUR",
});

/** 75%-owned ventures sub, which itself owns 50% of an operating company. */
export const venturesCo: Company = Company.parse({
  id: "co-ventures",
  name: "Ursin Ventures Oy",
  entityType: "corporation",
  jurisdiction: "FI",
  currency: "EUR",
  subsidiaries: [
    { id: "sub-opco", companyId: "co-opco", percentage: "50" },
  ],
});

/** Operating company, 50% held by venturesCo (= 75% * 50% = 37.5% via topco). */
export const opCo: Company = Company.parse({
  id: "co-opco",
  name: "Acme Operating Ltd",
  entityType: "corporation",
  jurisdiction: "GB",
  currency: "GBP",
});

/** The full sample ownership graph as a flat array of company nodes. */
export const sampleCompanies: Company[] = [
  topco,
  realEstateCo,
  venturesCo,
  opCo,
];
