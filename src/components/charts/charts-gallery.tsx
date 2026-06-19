import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AreaChart } from "./area-chart";
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
          <div className="flex items-center gap-3">
            <span className="text-2xl font-semibold tabular-nums">+12.4%</span>
            <Sparkline values={SPARKLINE_VALUES} width={160} height={40} />
          </div>
        </GalleryCard>

        <GalleryCard
          title="Line chart"
          description="Multi-series, shared y-domain."
        >
          <LineChart series={LINE_SERIES} width={440} height={200} />
        </GalleryCard>

        <GalleryCard
          title="Area chart"
          description="Single series with gradient fill."
        >
          <AreaChart values={AREA_VALUES} width={440} height={200} />
        </GalleryCard>

        <GalleryCard title="Bar chart" description="Allocation by asset class.">
          <BarChart data={BAR_DATA} width={440} height={200} colorByIndex />
        </GalleryCard>

        <GalleryCard
          title="Signed bars"
          description="Monthly P/L with up/down colours."
        >
          <BarChart data={SIGNED_BAR_DATA} width={440} height={200} signed />
        </GalleryCard>

        <GalleryCard
          title="Donut chart"
          description="Geographic exposure with centre total."
        >
          <DonutChart data={DONUT_DATA} size={200} centerLabel="100%" />
        </GalleryCard>

        <GalleryCard
          title="Treemap"
          description="Top holdings sized by weight."
        >
          <Treemap data={TREEMAP_DATA} width={440} height={220} />
        </GalleryCard>

        <GalleryCard
          title="Candlestick chart"
          description="OHLC price action."
        >
          <CandlestickChart data={CANDLE_DATA} width={440} height={200} />
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

      <main className="mx-auto max-w-5xl px-6 py-12">
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
