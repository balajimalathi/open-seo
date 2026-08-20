import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fetchLighthousePairMock,
  persistLighthouseResultsMock,
  selectLighthouseSampleMock,
  pgStepMock,
  getPagesForAuditMock,
} = vi.hoisted(() => ({
  fetchLighthousePairMock: vi.fn(),
  persistLighthouseResultsMock: vi.fn(),
  selectLighthouseSampleMock: vi.fn(),
  pgStepMock: vi.fn(),
  getPagesForAuditMock: vi.fn(),
}));

vi.mock("@/server/lib/audit/lighthouse", () => ({
  selectLighthouseSample: selectLighthouseSampleMock,
}));
vi.mock("@/server/features/audit/services/lighthousePersist", () => ({
  fetchLighthousePair: fetchLighthousePairMock,
  persistLighthouseResults: persistLighthouseResultsMock,
}));
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getPagesForAudit: getPagesForAuditMock,
    updateAuditProgress: vi.fn(),
  },
}));
vi.mock("@/server/features/audit/AuditScratchpad", () => ({
  getAuditScratchpad: vi.fn(),
}));
vi.mock("@/server/lib/audit/progress-kv", () => ({ AuditProgressKV: {} }));
vi.mock("@/server/lib/audit/discovery", () => ({
  discoverUrls: vi.fn(),
  parseRobotsTxt: vi.fn(),
}));
vi.mock("@/server/lib/audit/issues/multipage", () => ({
  runMultipageChecks: vi.fn(),
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/server/workflows/siteAuditWorkflowCrawl", () => ({
  runCrawlPhase: vi.fn(),
}));
vi.mock("@/server/workflows/pgStep", () => ({ pgStep: pgStepMock }));

import { runLighthousePhase } from "@/server/workflows/siteAuditWorkflowPhases";

const phaseParams = {
  auditId: "audit-1",
  workflowInstanceId: "workflow-1",
  billingCustomer: {
    userId: "user-1",
    userEmail: "test@example.com",
    organizationId: "org-1",
  },
  projectId: "project-1",
  startUrl: "https://example.com/",
  config: { maxPages: 50, lighthouseStrategy: "auto" as const },
};

describe("runLighthousePhase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPagesForAuditMock.mockResolvedValue([
      {
        id: "page-1",
        url: "https://example.com/",
        statusCode: 200,
      },
    ]);
    selectLighthouseSampleMock.mockReturnValue(["https://example.com/"]);
    fetchLighthousePairMock.mockResolvedValue([
      { result: { pageId: "page-1", strategy: "mobile" }, costUsd: 0.004 },
      { result: { pageId: "page-1", strategy: "desktop" }, costUsd: 0.004 },
    ]);
    persistLighthouseResultsMock.mockResolvedValue({
      completed: 2,
      failed: 0,
    });
  });

  it("does not replay paid calls when persistence retries", async () => {
    let persistenceAttempts = 0;
    let fetchRetryLimit: number | undefined;
    let persistenceRetryLimit: number | undefined;
    pgStepMock.mockImplementation(
      async (
        _step: unknown,
        name: string,
        config: { retries?: { limit?: number } },
        callback: () => Promise<unknown>,
      ) => {
        if (name === "lighthouse-fetch-1") {
          fetchRetryLimit = config.retries?.limit;
        }
        if (name === "lighthouse-persist-1") {
          persistenceRetryLimit = config.retries?.limit;
          persistenceAttempts += 1;
          try {
            return await callback();
          } catch (error) {
            if ((config.retries?.limit ?? 0) < 1) throw error;
            persistenceAttempts += 1;
            return callback();
          }
        }
        return callback();
      },
    );

    persistLighthouseResultsMock
      .mockRejectedValueOnce(new Error("progress unavailable"))
      .mockResolvedValue({ completed: 2, failed: 0 });

    // pgStep is mocked above, so the opaque WorkflowStep object is never read.
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    await runLighthousePhase({} as never, phaseParams);

    expect(fetchLighthousePairMock).toHaveBeenCalledTimes(1);
    expect(persistLighthouseResultsMock).toHaveBeenCalledTimes(2);
    expect(persistenceAttempts).toBe(2);
    expect(fetchRetryLimit).toBe(0);
    expect(persistenceRetryLimit).toBe(3);
  });

  it("does not replay paid calls for a cached legacy batch", async () => {
    pgStepMock.mockImplementation(
      async (
        _step: unknown,
        name: string,
        _config: unknown,
        callback: () => Promise<unknown>,
      ) => {
        if (name === "lighthouse-batch-1") {
          return { completed: 2, failed: 0 };
        }
        return callback();
      },
    );

    // pgStep is mocked above, so the opaque WorkflowStep object is never read.
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    await runLighthousePhase({} as never, phaseParams);

    expect(pgStepMock).toHaveBeenCalledWith(
      {},
      "lighthouse-batch-1",
      expect.anything(),
      expect.any(Function),
    );
    expect(fetchLighthousePairMock).not.toHaveBeenCalled();
  });
});
