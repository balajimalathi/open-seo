import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchLighthouseResult: vi.fn(),
  getLighthouseResultsForPage: vi.fn(),
  getLighthouseResultsForPages: vi.fn(),
  insertLighthouseResults: vi.fn(),
  updateAuditProgress: vi.fn(),
  trackUsageCreditSpend: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  assertUsageCreditsAvailable: vi.fn(),
}));

vi.mock("@/server/lib/dataforseo", () => ({
  fetchLighthouseLive: vi.fn(),
}));
vi.mock("@/server/lib/r2", () => ({
  putTextToR2: vi.fn(),
}));
vi.mock("@/server/lib/audit/lighthouse", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    fetchLighthouseResult: mocks.fetchLighthouseResult,
  };
});
vi.mock(
  "@/server/features/audit/repositories/AuditLighthouseRepository",
  () => ({
    AuditLighthouseRepository: {
      getLighthouseResultsForPage: mocks.getLighthouseResultsForPage,
      getLighthouseResultsForPages: mocks.getLighthouseResultsForPages,
      insertLighthouseResults: mocks.insertLighthouseResults,
    },
  }),
);
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    updateAuditProgress: mocks.updateAuditProgress,
  },
}));
vi.mock("@/server/billing/subscription", () => ({
  trackUsageCreditSpend: mocks.trackUsageCreditSpend,
  assertUsageCreditsAvailable: mocks.assertUsageCreditsAvailable,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));

import {
  fetchLighthousePair,
  persistLighthouseResults,
} from "@/server/features/audit/services/lighthousePersist";

const billingCustomer = {
  userId: "user-1",
  userEmail: "test@example.com",
  organizationId: "org-1",
};

function compactResult(strategy: "mobile" | "desktop", costUsd: number) {
  return {
    result: {
      url: "https://example.com/",
      pageId: "page-1",
      strategy,
      performanceScore: 90,
      accessibilityScore: 90,
      bestPracticesScore: 90,
      seoScore: 90,
      lcpMs: 1000,
      cls: 0.01,
      inpMs: 100,
      ttfbMs: 200,
      costUsd,
    },
    costUsd,
  };
}

describe("fetchLighthousePair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips paid fetches when both strategies are already stored", async () => {
    mocks.getLighthouseResultsForPage.mockResolvedValue([
      {
        pageId: "page-1",
        strategy: "mobile",
        creditsCharged: 6,
        costUsd: 0.004,
      },
      {
        pageId: "page-1",
        strategy: "desktop",
        creditsCharged: 6,
        costUsd: 0.004,
      },
    ]);

    const pair = await fetchLighthousePair({
      url: "https://example.com/",
      pageId: "page-1",
      projectId: "project-1",
      auditId: "audit-1",
    });

    expect(mocks.fetchLighthouseResult).not.toHaveBeenCalled();
    expect(pair.map((item) => item.result.strategy)).toEqual([
      "mobile",
      "desktop",
    ]);
  });

  it("fetches only the missing strategy", async () => {
    mocks.getLighthouseResultsForPage.mockResolvedValue([
      {
        pageId: "page-1",
        strategy: "mobile",
        creditsCharged: 6,
        costUsd: 0.004,
      },
    ]);
    mocks.fetchLighthouseResult.mockResolvedValue(
      compactResult("desktop", 0.004),
    );

    await fetchLighthousePair({
      url: "https://example.com/",
      pageId: "page-1",
      projectId: "project-1",
      auditId: "audit-1",
    });

    expect(mocks.fetchLighthouseResult).toHaveBeenCalledOnce();
    expect(mocks.fetchLighthouseResult).toHaveBeenCalledWith(
      "https://example.com/",
      "page-1",
      "desktop",
      { projectId: "project-1", auditId: "audit-1" },
    );
  });
});

describe("persistLighthouseResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.assertUsageCreditsAvailable.mockResolvedValue({
      monthlyRemaining: 1000,
    });
    mocks.insertLighthouseResults.mockResolvedValue(undefined);
    mocks.updateAuditProgress.mockResolvedValue(undefined);
    mocks.trackUsageCreditSpend.mockResolvedValue(undefined);
  });

  it("tracks spend on first persist and skips a replay that already charged", async () => {
    mocks.getLighthouseResultsForPages.mockResolvedValueOnce([]);
    await persistLighthouseResults({
      auditId: "audit-1",
      workflowInstanceId: "workflow-1",
      billingCustomer,
      fetched: [
        compactResult("mobile", 0.004),
        compactResult("desktop", 0.004),
      ],
      priorCompleted: 0,
      priorFailed: 0,
    });
    expect(mocks.trackUsageCreditSpend).toHaveBeenCalledTimes(2);

    mocks.trackUsageCreditSpend.mockClear();
    mocks.getLighthouseResultsForPages.mockResolvedValueOnce([
      {
        pageId: "page-1",
        strategy: "mobile",
        creditsCharged: 6,
        costUsd: 0.004,
      },
      {
        pageId: "page-1",
        strategy: "desktop",
        creditsCharged: 6,
        costUsd: 0.004,
      },
    ]);
    await persistLighthouseResults({
      auditId: "audit-1",
      workflowInstanceId: "workflow-1",
      billingCustomer,
      fetched: [
        compactResult("mobile", 0.004),
        compactResult("desktop", 0.004),
      ],
      priorCompleted: 0,
      priorFailed: 0,
    });
    expect(mocks.trackUsageCreditSpend).not.toHaveBeenCalled();
  });

  it("does not track spend for samples that were never billed", async () => {
    mocks.getLighthouseResultsForPages.mockResolvedValue([]);
    await persistLighthouseResults({
      auditId: "audit-1",
      workflowInstanceId: "workflow-1",
      billingCustomer,
      fetched: [
        {
          result: {
            ...compactResult("mobile", 0).result,
            errorMessage: "timeout",
            errorCode: "provider_timeout",
            costUsd: null,
          },
          costUsd: null,
        },
      ],
      priorCompleted: 0,
      priorFailed: 0,
    });
    expect(mocks.trackUsageCreditSpend).not.toHaveBeenCalled();
  });
});
