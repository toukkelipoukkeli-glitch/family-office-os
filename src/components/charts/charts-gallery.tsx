import { MAIN_CONTENT_ID } from "@/lib/main-content";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AreaChart } from "./area-chart";
import { ChartFigure } from "./chart-figure";
import { BarChart } from "./bar-chart";
import { CandlestickChart } from "./candlestick-chart";
import { DonutChart } from "./donut-chart";
import { LineChart } from "./line-chart";
import { Sparkline } from "./sparkline";
import { Treemap } from "./treemap";
import {
  AREA_VALUES,
  BAR_DATA,
  CANDLE_DATA,
  DONUT_DATA,
  LINE_SERIES,
  SIGNED_BAR_DATA,
  SPARKLINE_VALUES,
  TREEMAP_DATA,
} from "./fixtures";

interface GalleryCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

function GalleryCard({ title, description, children }: GalleryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Static demo gallery exercising every chart against fixed fixtures. Used by
 * the app's charts view and by the Playwright visual check.
 */
export function ChartsGallery() {
  return (
    <section data-testid="charts-gallery" className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <GalleryCard
          title="Sparkline"
          description="Inline KPI trend, no axes."
        >
          <ChartFigure
            testId="fig-sparkline"
            caption="Inline KPI trend: 10 sampled values."
            columns={[{ header: "Point" }, { header: "Value", align: "right" }]}
            rows={SPARKLINE_VALUES.map((v, i) => [`#${i + 1}`, v])}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl font-semibold tabular-nums">
                +12.4%
              </span>
              <Sparkline values={SPARKLINE_VALUES} width={160} height={40} />
            </div>
          </ChartFigure>
        </GalleryCard>

        <GalleryCard
          title="Line chart"
          description="Multi-series, shared y-domain."
        >
          <ChartFigure
            testId="fig-line"
            caption="Indexed performance by series over 7 periods."
            columns={[
              { header: "Period" },
              ...LINE_SERIES.map((s) => ({
                header: s.label,
                align: "right" as const,
              })),
            ]}
            rows={LINE_SERIES[0].values.map((_, i) => [
              `P${i + 1}`,
              ...LINE_SERIES.map((s) => s.values[i]),
            ])}
          >
            <LineChart series={LINE_SERIES} width={440} height={200} />
          </ChartFigure>
        </GalleryCard>

        <GalleryCard
          title="Area chart"
          description="Single series with gradient fill."
        >
          <ChartFigure
            testId="fig-area"
            caption="Single-series area values over 8 periods."
            columns={[{ header: "Period" }, { header: "Value", align: "right" }]}
            rows={AREA_VALUES.map((v, i) => [`P${i + 1}`, v])}
          >
            <AreaChart values={AREA_VALUES} width={440} height={200} />
          </ChartFigure>
        </GalleryCard>

        <GalleryCard title="Bar chart" description="Allocation by asset class.">
          <ChartFigure
            testId="fig-bar"
            caption="Allocation by asset class (percent)."
            columns={[
              { header: "Asset class" },
              { header: "Weight %", align: "right" },
            ]}
            rows={BAR_DATA.map((d) => [d.label, d.value])}
          >
            <BarChart data={BAR_DATA} width={440} height={200} colorByIndex />
          </ChartFigure>
        </GalleryCard>

        <GalleryCard
          title="Signed bars"
          description="Monthly P/L with up/down colours."
        >
          <ChartFigure
            testId="fig-signed-bar"
            caption="Monthly profit and loss (percent)."
            columns={[
              { header: "Month" },
              { header: "P/L %", align: "right" },
            ]}
            rows={SIGNED_BAR_DATA.map((d) => [d.label, d.value])}
          >
            <BarChart data={SIGNED_BAR_DATA} width={440} height={200} signed />
          </ChartFigure>
        </GalleryCard>

        <GalleryCard
          title="Donut chart"
          description="Geographic exposure with centre total."
        >
          <ChartFigure
            testId="fig-donut"
            caption="Geographic exposure by region (percent)."
            columns={[
              { header: "Region" },
              { header: "Share %", align: "right" },
            ]}
            rows={DONUT_DATA.map((d) => [d.label, d.value])}
          >
            <DonutChart data={DONUT_DATA} size={200} centerLabel="100%" />
          </ChartFigure>
        </GalleryCard>

        <GalleryCard
          title="Treemap"
          description="Top holdings sized by weight."
        >
          <ChartFigure
            testId="fig-treemap"
            caption="Top holdings sized by weight (percent)."
            columns={[
              { header: "Holding" },
              { header: "Weight %", align: "right" },
            ]}
            rows={TREEMAP_DATA.map((d) => [d.label, d.value])}
          >
            <Treemap data={TREEMAP_DATA} width={440} height={220} />
          </ChartFigure>
        </GalleryCard>

        <GalleryCard
          title="Candlestick chart"
          description="OHLC price action."
        >
          <ChartFigure
            testId="fig-candle"
            caption="OHLC price action over 5 sessions."
            columns={[
              { header: "Session" },
              { header: "Open", align: "right" },
              { header: "High", align: "right" },
              { header: "Low", align: "right" },
              { header: "Close", align: "right" },
            ]}
            rows={CANDLE_DATA.map((d) => [
              d.label ?? "",
              d.open,
              d.high,
              d.low,
              d.close,
            ])}
          >
            <CandlestickChart data={CANDLE_DATA} width={440} height={200} />
          </ChartFigure>
        </GalleryCard>
      </div>
    </section>
  );
}

/**
 * Full-page wrapper around {@link ChartsGallery} with app chrome and back
 * navigation. Routed at `#/charts` and exercised by the Playwright visual
 * check at desktop and mobile viewports.
 */
export function ChartsGalleryPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Charting kit
          </h1>
          <a
            href="#/"
            data-testid="charts-back"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main id={MAIN_CONTENT_ID} className="mx-auto max-w-5xl px-6 py-12">
        <p className="mb-8 text-sm text-muted-foreground">
          Reusable themed chart components rendered against deterministic
          fixtures.
        </p>
        <ChartsGallery />
      </main>
    </div>
  );
}

export default ChartsGallery;
