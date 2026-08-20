import { detectUrlTemplate, canonicalUrlKey } from "./url-utils";
import { fetchLighthouseLive } from "@/server/lib/dataforseo";
import { classifyLighthouseSampleError } from "@/server/lib/audit/lighthouse-errors";
import type { LighthouseResult, LighthouseStrategy } from "./types";
import { putTextToR2 } from "@/server/lib/r2";

interface LighthouseSamplePage {
  url: string;
  statusCode: number;
}

function canonicalUrlKeyWithoutTrailingSlash(url: string): string {
  const parsed = new URL(canonicalUrlKey(url));
  if (parsed.pathname !== "/") {
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
  }
  return parsed.toString();
}

export type LighthouseFetchResult = {
  result: LighthouseResult;
  costUsd: number | null;
};

function emptyScores(
  url: string,
  pageId: string,
  strategy: "mobile" | "desktop",
): LighthouseResult {
  return {
    url,
    pageId,
    strategy,
    performanceScore: null,
    accessibilityScore: null,
    bestPracticesScore: null,
    seoScore: null,
    lcpMs: null,
    cls: null,
    inpMs: null,
    ttfbMs: null,
  };
}

export async function fetchLighthouseResult(
  url: string,
  pageId: string,
  strategy: "mobile" | "desktop",
  storage: { projectId: string; auditId: string },
): Promise<LighthouseFetchResult> {
  try {
    const { data, billing } = await fetchLighthouseLive({ url, strategy });
    const payloadJson = JSON.stringify(data);
    const key = `site-audit/${storage.projectId}/${storage.auditId}/${pageId}-${strategy}.json`;
    const uploaded = await putTextToR2(key, payloadJson);

    return {
      result: {
        url,
        pageId,
        strategy,
        performanceScore: data.scores.performance,
        accessibilityScore: data.scores.accessibility,
        bestPracticesScore: data.scores["best-practices"],
        seoScore: data.scores.seo,
        lcpMs: data.metrics.largestContentfulPaint.numericValue,
        cls: data.metrics.cumulativeLayoutShift.numericValue,
        inpMs: data.metrics.interactionToNextPaint.numericValue,
        ttfbMs: data.metrics.serverResponseTime.numericValue,
        costUsd: billing.costUsd,
        r2Key: uploaded.key,
        payloadSizeBytes: uploaded.sizeBytes,
      },
      costUsd: billing.costUsd,
    };
  } catch (error) {
    const classified = classifyLighthouseSampleError(error);
    console.error(`Lighthouse failed for ${url}:`, classified.errorMessage);
    return {
      result: {
        ...emptyScores(url, pageId, strategy),
        errorMessage: classified.errorMessage,
        errorCode: classified.errorCode,
        costUsd: classified.costUsd,
      },
      costUsd: classified.costUsd,
    };
  }
}

/**
 * Select which pages to run Lighthouse on, based on the chosen strategy.
 */
export function selectLighthouseSample(
  pages: LighthouseSamplePage[],
  startUrl: string,
  strategy: LighthouseStrategy,
): string[] {
  if (strategy === "none") return [];

  // Only consider pages that loaded successfully
  const validPages = pages.filter(
    (p) => p.statusCode >= 200 && p.statusCode < 300,
  );

  // strategy === "auto": homepage + 1 per URL pattern, capped at 10
  const selected = new Set<string>();

  // Always include the start URL / homepage. Prefer an exact canonical match
  // so distinct 2xx `/path` and `/path/` pages stay distinct, then tolerate a
  // trailing-slash redirect when the exact start URL was not crawled as 2xx.
  const startKey = canonicalUrlKey(startUrl);
  const startPage =
    validPages.find((p) => canonicalUrlKey(p.url) === startKey) ??
    validPages.find(
      (p) =>
        canonicalUrlKeyWithoutTrailingSlash(p.url) ===
        canonicalUrlKeyWithoutTrailingSlash(startUrl),
    );
  if (startPage) selected.add(startPage.url);

  // Group by URL template pattern
  const templateGroups = new Map<string, LighthouseSamplePage>();
  if (startPage) {
    templateGroups.set(
      detectUrlTemplate(new URL(startPage.url).pathname),
      startPage,
    );
  }
  for (const page of validPages) {
    if (selected.has(page.url)) continue;
    const template = detectUrlTemplate(new URL(page.url).pathname);
    if (!templateGroups.has(template)) {
      templateGroups.set(template, page);
    }
  }

  // Add one page per template group
  for (const [, page] of templateGroups) {
    if (selected.size >= 10) break;
    selected.add(page.url);
  }

  return Array.from(selected);
}
