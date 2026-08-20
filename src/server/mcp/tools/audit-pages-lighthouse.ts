type AuditPageRow = {
  id: string;
  url: string;
  statusCode: number | null;
  fetchClass: string;
  title: string | null;
};

type LighthousePageRow = {
  pageId: string;
  strategy: "mobile" | "desktop";
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
  ttfbMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export function attachLighthouseToAuditPages<T extends AuditPageRow>(
  pages: T[],
  lighthouseRows: LighthousePageRow[],
) {
  const lighthouseByPage = new Map<string, LighthousePageRow[]>();
  for (const row of lighthouseRows) {
    const current = lighthouseByPage.get(row.pageId) ?? [];
    current.push(row);
    lighthouseByPage.set(row.pageId, current);
  }

  return pages.map((page) => ({
    ...page,
    lighthouse: (lighthouseByPage.get(page.id) ?? []).map((row) => ({
      strategy: row.strategy,
      performanceScore: row.performanceScore,
      accessibilityScore: row.accessibilityScore,
      bestPracticesScore: row.bestPracticesScore,
      seoScore: row.seoScore,
      lcpMs: row.lcpMs,
      cls: row.cls,
      inpMs: row.inpMs,
      ttfbMs: row.ttfbMs,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
    })),
  }));
}

export function formatAuditPagesText(input: {
  auditId: string;
  filteredCount: number;
  limit: number;
  lighthouseCount: number;
  pages: Array<{
    statusCode: number | null;
    url: string;
    fetchClass: string;
    title: string | null;
    lighthouse: Array<{
      strategy: string;
      errorCode: string | null;
      performanceScore: number | null;
    }>;
  }>;
}) {
  const lighthouseNote =
    input.lighthouseCount > 0
      ? ` ${input.lighthouseCount} Lighthouse check(s) stored.`
      : "";
  return [
    `Audit ${input.auditId}: ${input.filteredCount} pages${input.filteredCount > input.limit ? ` (showing ${input.limit})` : ""}.${lighthouseNote}`,
    ...input.pages.slice(0, 25).map((page) => {
      const scores = page.lighthouse
        .map((sample) =>
          sample.errorCode
            ? `${sample.strategy}:${sample.errorCode}`
            : `${sample.strategy}:${sample.performanceScore ?? "-"}`,
        )
        .join(" ");
      return `- ${page.statusCode} ${page.url}${page.fetchClass !== "ok" ? ` [${page.fetchClass}]` : ""}${scores ? `  ${scores}` : ""}  "${page.title ?? ""}"`;
    }),
    "Full rows are in structuredContent.pages.",
  ].join("\n");
}

function failedAuditAgentNextStep(input: {
  status: string;
  pagesCrawled: number;
  lighthouseStored: number;
}): string {
  if (input.status === "completed") {
    return " Call get_audit_issues for the issue report.";
  }
  if (
    input.status !== "failed" ||
    (input.pagesCrawled <= 0 && input.lighthouseStored <= 0)
  ) {
    return "";
  }
  const lighthousePart =
    input.lighthouseStored > 0
      ? ` and ${input.lighthouseStored} Lighthouse check(s)`
      : "";
  const lighthouseTool =
    input.lighthouseStored > 0
      ? " and get_audit_pages for stored Lighthouse scores."
      : ".";
  return ` The audit stopped early but kept results for the ${input.pagesCrawled} pages it crawled${lighthousePart} — call get_audit_issues for the partial issue report${lighthouseTool}`;
}

export function formatAuditStatusText(input: {
  id: string;
  startUrl: string;
  status: string;
  currentPhase: string | null;
  pagesCrawled: number;
  pagesTotal: number;
  lighthouseTotal: number;
  lighthouseCompleted: number;
  lighthouseFailed: number;
}): string {
  const lighthouseNote =
    input.lighthouseTotal > 0
      ? `, lighthouse ${input.lighthouseCompleted + input.lighthouseFailed}/${input.lighthouseTotal}`
      : "";
  const nextStep = failedAuditAgentNextStep({
    status: input.status,
    pagesCrawled: input.pagesCrawled,
    lighthouseStored: input.lighthouseCompleted + input.lighthouseFailed,
  });
  return `Audit ${input.id} (${input.startUrl}): ${input.status} — phase ${input.currentPhase}, ${input.pagesCrawled}/${input.pagesTotal} pages${lighthouseNote}.${nextStep}`;
}
