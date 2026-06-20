import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ExportMenu } from "./ExportMenu";
import type { DownloadDeps, ExportDataset } from "@/lib/export";

const dataset: ExportDataset = {
  name: "sample",
  table: { columns: ["a", "b"], rows: [["1", "2"]] },
  json: { a: 1, b: 2 },
};

/** A recording fake DOM so the click can be asserted without a real download. */
function recordingDeps() {
  const anchor = {
    href: "",
    download: "",
    rel: "",
    click: vi.fn(),
  } as unknown as HTMLAnchorElement;
  const deps: DownloadDeps = {
    createObjectURL: () => "blob:fake",
    revokeObjectURL: vi.fn(),
    createElement: () => anchor,
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  };
  return { deps, anchor };
}

describe("ExportMenu", () => {
  it("renders a CSV and a JSON button", () => {
    render(<ExportMenu dataset={dataset} />);
    expect(screen.getByTestId("export-csv")).toHaveTextContent("CSV");
    expect(screen.getByTestId("export-json")).toHaveTextContent("JSON");
  });

  it("downloads a .csv file when CSV is clicked", async () => {
    const { deps, anchor } = recordingDeps();
    render(<ExportMenu dataset={dataset} downloadDeps={deps} />);
    await userEvent.click(screen.getByTestId("export-csv"));
    expect(anchor.download).toBe("sample.csv");
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });

  it("downloads a .json file when JSON is clicked", async () => {
    const { deps, anchor } = recordingDeps();
    render(<ExportMenu dataset={dataset} downloadDeps={deps} />);
    await userEvent.click(screen.getByTestId("export-json"));
    expect(anchor.download).toBe("sample.json");
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });

  it("honours a custom testId prefix and exposes an accessible group", () => {
    render(<ExportMenu dataset={dataset} testId="foo-export" />);
    expect(screen.getByTestId("foo-export")).toHaveAttribute(
      "aria-label",
      "Export data",
    );
    expect(screen.getByTestId("foo-export-csv")).toBeInTheDocument();
  });
});
