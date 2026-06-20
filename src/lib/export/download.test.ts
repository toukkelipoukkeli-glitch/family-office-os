import { describe, expect, it, vi } from "vitest";

import {
  MIME,
  slugifyFilename,
  triggerDownload,
  type DownloadDeps,
} from "./download";

/** A recording fake DOM so we can assert the download without a real browser. */
function fakeDeps() {
  const anchor = {
    href: "",
    download: "",
    rel: "",
    click: vi.fn(),
  } as unknown as HTMLAnchorElement;
  const calls = {
    created: [] as string[],
    appended: 0,
    removed: 0,
    revoked: [] as string[],
  };
  let urlCounter = 0;
  const blobs: Blob[] = [];
  const deps: DownloadDeps = {
    createObjectURL: (blob) => {
      blobs.push(blob);
      const url = `blob:fake/${urlCounter++}`;
      calls.created.push(url);
      return url;
    },
    revokeObjectURL: (url) => calls.revoked.push(url),
    createElement: () => anchor,
    appendChild: () => {
      calls.appended++;
    },
    removeChild: () => {
      calls.removed++;
    },
  };
  return { deps, anchor, calls, blobs };
}

describe("triggerDownload", () => {
  it("creates an anchor, clicks it, and revokes the object URL", async () => {
    const { deps, anchor, calls, blobs } = fakeDeps();
    triggerDownload(
      { filename: "data.csv", content: "a,b\r\n1,2\r\n", mimeType: MIME.csv },
      deps,
    );

    expect(anchor.download).toBe("data.csv");
    expect(anchor.href).toBe("blob:fake/0");
    expect(anchor.rel).toBe("noopener");
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(calls.appended).toBe(1);
    expect(calls.removed).toBe(1);
    // The URL is always revoked.
    expect(calls.revoked).toEqual(["blob:fake/0"]);

    // The blob carries the exact size + MIME type. (jsdom's Blob has no async
    // `.text()`, so assert on `size`, which equals the byte length of the
    // ASCII payload.)
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe(MIME.csv);
    expect(blobs[0].size).toBe("a,b\r\n1,2\r\n".length);
  });

  it("revokes the object URL even when the click throws", () => {
    const { deps, anchor, calls } = fakeDeps();
    (anchor.click as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() =>
      triggerDownload({ filename: "x.json", content: "{}" }, deps),
    ).toThrow("boom");
    expect(calls.revoked).toEqual(["blob:fake/0"]);
  });

  it("defaults the MIME type to text/plain", () => {
    const { deps, blobs } = fakeDeps();
    triggerDownload({ filename: "x.txt", content: "hi" }, deps);
    expect(blobs[0].type).toBe("text/plain;charset=utf-8");
  });
});

describe("slugifyFilename", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyFilename("Net Worth 2026-06-19")).toBe("net-worth-2026-06-19");
  });
  it("collapses runs of non-alphanumerics and trims hyphens", () => {
    expect(slugifyFilename("  Board / Report!! ")).toBe("board-report");
  });
  it("falls back to 'export' for an empty result", () => {
    expect(slugifyFilename("---")).toBe("export");
  });
});
