import { Building2, Users, Wallet, LineChart } from "lucide-react";
import { useMemo, useState } from "react";

import { BarChart, DonutChart } from "@/components/charts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  financialsChronological,
  holdingWeights,
  latestFinancialYear,
  netDebt,
  totalHoldingsValue,
  type Company,
  type CompanyProfile,
  type HoldingKind,
  type Person,
} from "@/lib/company";
import {
  personMaria,
  personTouko,
  realEstateCo,
  topco,
  venturesCo,
} from "@/lib/company/fixtures";
import {
  realEstateProfile,
  topcoProfile,
  venturesProfile,
} from "@/lib/company/profile-fixtures";
import { Money } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Companies that have a profile, in display order. */
const COMPANIES: { company: Company; profile: CompanyProfile }[] = [
  { company: topco, profile: topcoProfile },
  { company: realEstateCo, profile: realEstateProfile },
  { company: venturesCo, profile: venturesProfile },
];

const PEOPLE_BY_ID: Record<string, Person> = {
  [personTouko.id]: personTouko,
  [personMaria.id]: personMaria,
};

const HOLDING_LABEL: Record<HoldingKind, string> = {
  equity: "Equity",
  fund: "Fund",
  real_estate: "Real estate",
  fixed_income: "Fixed income",
  cash: "Cash",
  private: "Private",
  other: "Other",
};

const ENTITY_LABEL: Record<string, string> = {
  corporation: "Corporation",
  llc: "LLC",
  partnership: "Partnership",
  trust: "Trust",
  foundation: "Foundation",
  holding_company: "Holding company",
  fund: "Fund",
  other: "Other",
};

function money(amount: string, currency: string): string {
  return Money.of(amount, currency).format({ fractionDigits: 0 });
}

function moneyCompact(amount: string, currency: string): string {
  const n = Number(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function FinancialsCard({ profile }: { profile: CompanyProfile }) {
  const chrono = financialsChronological(profile);
  const latest = latestFinancialYear(profile);
  const ccy = profile.reportingCurrency;

  const revenueBars = chrono.map((f) => ({
    label: String(f.fiscalYear),
    value: Number(f.revenue.amount),
  }));

  const kpis = latest
    ? [
        { label: "Revenue", value: money(latest.revenue.amount, ccy) },
        { label: "EBITDA", value: money(latest.ebitda.amount, ccy) },
        {
          label: "Net income",
          value: money(latest.netIncome.amount, ccy),
          negative: Number(latest.netIncome.amount) < 0,
        },
        { label: "Total assets", value: money(latest.totalAssets.amount, ccy) },
        { label: "Equity", value: money(latest.totalEquity.amount, ccy) },
        {
          label: "Net debt",
          value: netDebt(latest).format({ fractionDigits: 0 }),
          negative: netDebt(latest).isNegative(),
        },
      ]
    : [];

  return (
    <Card data-testid="financials-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LineChart className="size-4 text-muted-foreground" aria-hidden />
          Financials
        </CardTitle>
        <CardDescription>
          {latest
            ? `FY${latest.fiscalYear} headline figures · ${ccy}`
            : "No financials on file"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {latest ? (
          <>
            <dl
              data-testid="financial-kpis"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {kpis.map((k) => (
                <div
                  key={k.label}
                  data-testid="financial-kpi"
                  className="rounded-lg border border-border p-3"
                >
                  <dt className="text-xs text-muted-foreground">{k.label}</dt>
                  <dd
                    className={cn(
                      "mt-1 text-base font-semibold tabular-nums",
                      k.negative && "text-destructive",
                    )}
                  >
                    {k.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Revenue by fiscal year
              </p>
              <BarChart
                data-testid="revenue-chart"
                data={revenueBars}
                width={520}
                height={160}
                className="w-full"
              />
              <div
                className="flex justify-around text-xs text-muted-foreground tabular-nums"
                aria-hidden
              >
                {revenueBars.map((b) => (
                  <span key={b.label}>{b.label}</span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No financial data is available for this entity.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function HoldingsCard({ profile }: { profile: CompanyProfile }) {
  const ccy = profile.reportingCurrency;
  const weights = holdingWeights(profile);
  const total = totalHoldingsValue(profile);

  // Largest first.
  const rows = profile.holdings
    .map((h) => ({
      ...h,
      weight: weights.find((w) => w.id === h.id)?.weight ?? 0,
    }))
    .sort((a, b) => Number(b.value.amount) - Number(a.value.amount));

  const donutData = rows.map((h) => ({
    label: h.name,
    value: Number(h.value.amount),
  }));

  return (
    <Card data-testid="holdings-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="size-4 text-muted-foreground" aria-hidden />
          Holdings
        </CardTitle>
        <CardDescription>
          {rows.length} position{rows.length === 1 ? "" : "s"} ·{" "}
          <span data-testid="holdings-total" className="tabular-nums">
            {money(total.amount.toFixed(), ccy)}
          </span>{" "}
          total
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No holdings recorded for this entity.
          </p>
        ) : (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="mx-auto shrink-0 sm:mx-0">
              <DonutChart
                data={donutData}
                size={160}
                thickness={0.42}
                centerLabel={moneyCompact(total.amount.toFixed(), ccy)}
              />
            </div>
            <ul data-testid="holdings-list" className="min-w-0 flex-1 space-y-2">
              {rows.map((h, i) => (
                <li
                  key={h.id}
                  data-testid="holding-row"
                  data-holding-id={h.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: `var(--color-chart-${(i % 6) + 1})`,
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {h.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {HOLDING_LABEL[h.kind]}
                        {h.ticker ? ` · ${h.ticker}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-medium tabular-nums">
                      {money(h.value.amount, h.value.currency)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {h.weight.toFixed(1)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PeopleCard({ profile }: { profile: CompanyProfile }) {
  const people = profile.people
    .map((cp) => ({ ...cp, person: PEOPLE_BY_ID[cp.personId] }))
    .filter((p) => p.person);

  return (
    <Card data-testid="people-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          People
        </CardTitle>
        <CardDescription>
          {people.length} key {people.length === 1 ? "person" : "people"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No people are linked to this entity.
          </p>
        ) : (
          <ul data-testid="people-list" className="space-y-3">
            {people.map((p) => (
              <li
                key={p.personId}
                data-testid="person-row"
                data-person-id={p.personId}
                className="flex items-center gap-3"
              >
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                >
                  {initials(p.person!.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {p.person!.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.title ?? roleLabel(p.role)}
                    {p.person!.countryOfResidence
                      ? ` · ${p.person!.countryOfResidence}`
                      : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function CompanyProfilePage() {
  const [selectedId, setSelectedId] = useState<string>(COMPANIES[0].company.id);
  const selected = useMemo(
    () =>
      COMPANIES.find((c) => c.company.id === selectedId) ?? COMPANIES[0],
    [selectedId],
  );
  const { company, profile } = selected;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Company profiles
          </h1>
          <a
            href="#/"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {/* Company selector */}
        <div
          role="tablist"
          aria-label="Select a company"
          data-testid="company-tabs"
          className="flex flex-wrap gap-2"
        >
          {COMPANIES.map(({ company: c }) => {
            const active = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid="company-tab"
                data-company-id={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        {/* Identity header card */}
        <Card data-testid="company-header" data-company-id={company.id}>
          <CardHeader>
            <div className="flex items-start gap-4">
              <span
                aria-hidden
                className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
              >
                <Building2 className="size-6" />
              </span>
              <div className="min-w-0">
                <CardTitle className="truncate">{company.name}</CardTitle>
                <CardDescription>
                  {ENTITY_LABEL[company.entityType] ?? company.entityType} ·{" "}
                  {company.jurisdiction} · {company.currency}
                  {company.registrationNumber
                    ? ` · ${company.registrationNumber}`
                    : ""}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <FinancialsCard profile={profile} />

        <div className="grid gap-6 lg:grid-cols-2">
          <HoldingsCard profile={profile} />
          <PeopleCard profile={profile} />
        </div>
      </main>
    </div>
  );
}

export default CompanyProfilePage;
