import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-6">
          <h1 className="text-lg font-semibold tracking-tight">
            Family Office OS
          </h1>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl justify-center px-6 py-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Net worth</CardTitle>
            <CardDescription>
              Consolidated across all accounts and holdings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold tracking-tight tabular-nums">
              $12,480,000
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Last updated just now
            </p>
          </CardContent>
          <CardFooter>
            <Button>
              View details
              <ArrowUpRight />
            </Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}

export default App;
