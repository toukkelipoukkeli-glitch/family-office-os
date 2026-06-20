import * as React from "react";
import {
  CalendarClock,
  FileText,
  Landmark,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { formatMoneyValue, formatMoneyValueWhole } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ExportMenu } from "@/components/ExportMenu";
import { tableExport } from "@/lib/export";
import {
  buildRegistry,
  documentKindLabel,
  extractVaultObligations,
  obligationKindLabel,
  seededVault,
  totalByKind,
  type DocumentView,
  type Obligation,
  type ObligationKind,
  type Vault,
} from "@/lib/vault";

const KIND_TONE: Record<ObligationKind, string> = {
  "capital-call": "var(--color-chart-down)",
  premium: "var(--color-chart-down)",
  fee: "var(--color-chart-down)",
  distribution: "var(--color-chart-up)",
  deadline: "var(--color-chart-3, #888)",
};

function money(amount: { currency: string; amount: { toNumber(): number } }): string {
  return formatMoneyValue(amount);
}

function moneyFull(amount: {
  currency: string;
  amount: { toNumber(): number };
}): string {
  return formatMoneyValueWhole(amount);
}

interface KpiProps {
  testId: string;
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}

function Kpi({ testId, label, value, hint, icon }: KpiProps) {
  return (
    <div data-testid={testId} className="rounded-lg border border-border p-4">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ObligationBadge({ kind }: { kind: ObligationKind }) {
  return (
    <span
      data-testid="obligation-badge"
      data-kind={kind}
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        color: KIND_TONE[kind],
        backgroundColor: `color-mix(in srgb, ${KIND_TONE[kind]} 14%, transparent)`,
      }}
    >
      {obligationKindLabel(kind)}
    </span>
  );
}

export interface VaultPageProps {
  /** Optional vault override (mainly for tests); defaults to the seeded fixture. */
  vault?: Vault;
}

/**
 * Document & obligation vault — the read-only registry of family-office
 * documents (subscription agreements, side letters, insurance, trust deeds,
 * LPAs) linked to entities, with offline-extracted obligations.
 *
 * The left column lists every document; selecting one reveals its linked
 * entities and its parsed obligations. A global "upcoming obligations" timeline
 * aggregates dated dues across the whole vault. All figures are derived from the
 * deterministic offline extractor — nothing here moves money.
 */
export function VaultPage({ vault }: VaultPageProps) {
  const v = vault ?? seededVault;
  const registry: DocumentView[] = React.useMemo(() => buildRegistry(v), [v]);
  const allObligations: Obligation[] = React.useMemo(
    () => extractVaultObligations(v),
    [v],
  );

  const [selectedId, setSelectedId] = React.useState<string>(
    registry[0]?.document.id ?? "",
  );
  const selected =
    registry.find((r) => r.document.id === selectedId) ?? registry[0];

  const capitalCalls = totalByKind(allObligations, "capital-call", "USD");
  const fees = totalByKind(allObligations, "fee", "USD");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Document &amp; obligation vault
          </h1>
          <div className="flex items-center gap-4">
            <ExportMenu
              dataset={tableExport(
                "vault-documents",
                [
                  "id",
                  "title",
                  "kind",
                  "counterparty",
                  "executedOn",
                  "currency",
                  "entityIds",
                  "obligationCount",
                ],
                registry.map((d) => [
                  d.document.id,
                  d.document.title,
                  d.document.kind,
                  d.document.counterparty,
                  d.document.executedOn,
                  d.document.currency,
                  d.document.entityIds.join("|"),
                  d.obligations.length,
                ]),
                {
                  documents: registry.map((d) => ({
                    id: d.document.id,
                    title: d.document.title,
                    kind: d.document.kind,
                    counterparty: d.document.counterparty,
                    executedOn: d.document.executedOn,
                    currency: d.document.currency,
                    entityIds: d.document.entityIds,
                    obligationCount: d.obligations.length,
                  })),
                },
              )}
              testId="vault-export"
            />
            <a
              href="#/"
              data-testid="vault-back"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-6xl space-y-6 px-6 py-10"
        data-testid="vault-page"
      >
        <p className="text-sm text-muted-foreground" data-testid="vault-subtitle">
          A read-only registry of {registry.length} family-office documents, with
          dates and amounts parsed offline from each document&rsquo;s text.
        </p>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            testId="kpi-documents"
            label="Documents"
            value={String(registry.length)}
            hint="filed across the family office"
            icon={<FileText className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-obligations"
            label="Obligations"
            value={String(allObligations.length)}
            hint="dated dues extracted"
            icon={<CalendarClock className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-capital-calls"
            label="Capital calls (USD)"
            value={money(capitalCalls)}
            hint="committed & scheduled"
            icon={<Wallet className="size-3.5" aria-hidden="true" />}
          />
          <Kpi
            testId="kpi-fees"
            label="Fees (USD)"
            value={money(fees)}
            hint="management & admin"
            icon={<Landmark className="size-3.5" aria-hidden="true" />}
          />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Document registry */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Registry
            </h2>
            <ul
              data-testid="document-list"
              className="divide-y divide-border overflow-hidden rounded-lg border border-border"
            >
              {registry.map((view) => {
                const isActive = view.document.id === selected?.document.id;
                return (
                  <li key={view.document.id}>
                    <button
                      type="button"
                      data-testid="document-row"
                      data-document={view.document.id}
                      data-active={isActive}
                      onClick={() => setSelectedId(view.document.id)}
                      className={cn(
                        "flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors",
                        isActive ? "bg-muted" : "hover:bg-muted/50",
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {view.document.title}
                        </span>
                        <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-secondary-foreground">
                          {documentKindLabel(view.document.kind)}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {view.document.counterparty} ·{" "}
                        {view.obligations.length}{" "}
                        {view.obligations.length === 1
                          ? "obligation"
                          : "obligations"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Selected document detail */}
          {selected && (
            <section className="space-y-4" data-testid="document-detail">
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      className="text-base font-semibold"
                      data-testid="detail-title"
                    >
                      {selected.document.title}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {documentKindLabel(selected.document.kind)} · executed{" "}
                      {selected.document.executedOn} ·{" "}
                      {selected.document.counterparty}
                    </p>
                  </div>
                  <ShieldCheck
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>

                <div className="mt-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Linked entities
                  </p>
                  <ul
                    data-testid="entity-list"
                    className="mt-1 flex flex-wrap gap-1.5"
                  >
                    {selected.entities.map((e) => (
                      <li
                        key={e.id}
                        data-testid="entity-chip"
                        data-entity={e.id}
                        className="rounded-full border border-border px-2 py-0.5 text-xs"
                      >
                        {e.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Extracted obligations
                </p>
                {selected.obligations.length === 0 ? (
                  <p
                    data-testid="no-obligations"
                    className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
                  >
                    No dated obligations parsed from this document.
                  </p>
                ) : (
                  <ul
                    data-testid="obligation-list"
                    className="space-y-2"
                  >
                    {selected.obligations.map((o) => (
                      <li
                        key={o.id}
                        data-testid="obligation-row"
                        data-kind={o.kind}
                        data-due={o.dueOn}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <ObligationBadge kind={o.kind} />
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {o.dueOn}
                            </span>
                          </span>
                          <span className="mt-1 block text-sm">
                            {o.description}
                          </span>
                        </span>
                        {o.amount && (
                          <span
                            data-testid="obligation-amount"
                            className="shrink-0 text-sm font-semibold tabular-nums"
                          >
                            {moneyFull(o.amount)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Global upcoming-obligations timeline */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Upcoming obligations across the vault
          </h2>
          <ol
            data-testid="timeline"
            className="overflow-hidden rounded-lg border border-border"
          >
            {allObligations.map((o) => {
              const doc = v.documents.find((d) => d.id === o.documentId);
              return (
                <li
                  key={o.id}
                  data-testid="timeline-row"
                  data-kind={o.kind}
                  className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
                >
                  <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {o.dueOn}
                  </span>
                  <ObligationBadge kind={o.kind} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {doc?.title ?? o.documentId}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {o.amount ? moneyFull(o.amount) : "—"}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    </div>
  );
}

export default VaultPage;
