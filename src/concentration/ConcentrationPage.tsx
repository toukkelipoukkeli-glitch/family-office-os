import { ConcentrationView } from "./ConcentrationView";

export { ConcentrationView } from "./ConcentrationView";

/**
 * Full-page wrapper around {@link ConcentrationView} with app chrome and back
 * navigation. Routed at `#/concentration` and exercised by the Playwright
 * visual check at desktop and mobile viewports.
 */
export function ConcentrationPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Concentration &amp; single-name risk
          </h1>
          <a
            href="#/"
            data-testid="concentration-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="mb-8 text-sm text-muted-foreground">
          The family's true single-name risk — surfaced{" "}
          <span className="font-medium text-foreground">with look-through</span>:
          a fund's value is rolled down to its underlying holdings, so the same
          name held directly and inside several funds is summed into one honest
          exposure. The monitor flags the largest single names and issuers as a
          share of net worth, sector concentration, and the illiquid share. Every
          roll-up reconciles to net worth exactly. A breach is a governance
          signal for a human — this product is read-only and never moves money.
          Rendered from deterministic fixtures.
        </p>
        <ConcentrationView />
      </main>
    </div>
  );
}

export default ConcentrationPage;
