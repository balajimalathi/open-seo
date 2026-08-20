import { afterEach, describe, expect, it, vi } from "vitest";

const fetchLighthouseLiveMock = vi.hoisted(() => vi.fn());
const putTextToR2Mock = vi.hoisted(() => vi.fn());

vi.mock("@/server/lib/dataforseo", () => ({
  fetchLighthouseLive: fetchLighthouseLiveMock,
}));

vi.mock("@/server/lib/r2", () => ({
  putTextToR2: putTextToR2Mock,
}));

import { fetchLighthouseResult, selectLighthouseSample } from "./lighthouse";

afterEach(() => {
  vi.clearAllMocks();
});

describe("selectLighthouseSample", () => {
  it("includes a start page reached through a trailing-slash redirect", () => {
    const pages = [
      ...Array.from({ length: 10 }, (_, index) => ({
        url: `https://example.com/section${index}`,
        statusCode: 200,
      })),
      { url: "https://example.com/services/", statusCode: 200 },
    ];

    const selected = selectLighthouseSample(
      pages,
      "https://example.com/services",
      "auto",
    );

    expect(selected).toHaveLength(10);
    expect(selected[0]).toBe("https://example.com/services/");
  });

  it("prefers an exact start page when both slash forms return 2xx", () => {
    const selected = selectLighthouseSample(
      [
        { url: "https://example.com/services/", statusCode: 200 },
        { url: "https://example.com/services", statusCode: 200 },
      ],
      "https://example.com/services",
      "auto",
    );

    expect(selected[0]).toBe("https://example.com/services");
  });

  it("does not sample another page from the start page's template", () => {
    const selected = selectLighthouseSample(
      [
        { url: "https://example.com/products/123", statusCode: 200 },
        { url: "https://example.com/products/456", statusCode: 200 },
        { url: "https://example.com/about", statusCode: 200 },
      ],
      "https://example.com/products/123",
      "auto",
    );

    expect(selected).toEqual([
      "https://example.com/products/123",
      "https://example.com/about",
    ]);
  });
});

const scores = {
  performance: 90,
  accessibility: 91,
  "best-practices": 92,
  seo: 93,
};
const metrics = {
  largestContentfulPaint: { numericValue: 1000 },
  cumulativeLayoutShift: { numericValue: 0.01 },
  interactionToNextPaint: { numericValue: 100 },
  serverResponseTime: { numericValue: 200 },
};

describe("fetchLighthouseResult", () => {
  const storage = { projectId: "project-1", auditId: "audit-1" };

  it("does not retry an ambiguous generic failure", async () => {
    fetchLighthouseLiveMock
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({
        data: { scores, metrics },
        billing: { costUsd: 0.004, path: ["on_page", "lighthouse"] },
      });

    const fetched = await fetchLighthouseResult(
      "https://example.com/",
      "page-1",
      "desktop",
      storage,
    );

    expect(fetchLighthouseLiveMock).toHaveBeenCalledOnce();
    expect(fetched.result.errorMessage).toBe("temporary failure");
    expect(fetched.result.errorCode).toBe("unknown");
    expect(putTextToR2Mock).not.toHaveBeenCalled();
  });

  it("uploads the payload to R2 and returns compact scores", async () => {
    fetchLighthouseLiveMock.mockResolvedValue({
      data: { scores, metrics },
      billing: { costUsd: 0.00425, path: ["on_page", "lighthouse"] },
    });
    putTextToR2Mock.mockResolvedValue({
      key: "site-audit/project-1/audit-1/page-1-desktop.json",
      sizeBytes: 12,
    });

    const fetched = await fetchLighthouseResult(
      "https://example.com/",
      "page-1",
      "desktop",
      storage,
    );

    expect(putTextToR2Mock).toHaveBeenCalledWith(
      "site-audit/project-1/audit-1/page-1-desktop.json",
      JSON.stringify({ scores, metrics }),
    );
    expect(fetched).not.toHaveProperty("payloadJson");
    expect(fetched.result.r2Key).toBe(
      "site-audit/project-1/audit-1/page-1-desktop.json",
    );
    expect(fetched.result.performanceScore).toBe(90);
    expect(fetched.costUsd).toBe(0.00425);
  });

  it("classifies a provider timeout as a compact sample error", async () => {
    fetchLighthouseLiveMock.mockRejectedValue(new Error("Request timed out"));

    const fetched = await fetchLighthouseResult(
      "https://example.com/",
      "page-1",
      "mobile",
      storage,
    );

    expect(fetched.result.errorCode).toBe("provider_timeout");
    expect(fetched.result.performanceScore).toBeNull();
    expect(putTextToR2Mock).not.toHaveBeenCalled();
  });
});
