import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuditPagesTool, getAuditStatusTool } from "./site-audit-tools";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getAuditForProject: vi.fn(),
  getPagesForAudit: vi.fn(),
  getLighthouseResultsForAudit: vi.fn(),
  getStatus: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock(
  "@/server/features/audit/repositories/AuditLighthouseRepository",
  () => ({
    AuditLighthouseRepository: {
      getLighthouseResultsForAudit: mocks.getLighthouseResultsForAudit,
    },
  }),
);
vi.mock("@/server/features/audit/repositories/AuditRepository", () => ({
  AuditRepository: {
    getAuditForProject: mocks.getAuditForProject,
    getPagesForAudit: mocks.getPagesForAudit,
  },
}));
vi.mock("@/server/features/audit/services/AuditService", () => ({
  AuditService: {
    getStatus: mocks.getStatus,
  },
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: vi.fn(),
}));

const toolContext = makeToolContext();

describe("get_audit_pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.getAuditForProject.mockResolvedValue({
      id: "audit_1",
      startUrl: "https://example.com/",
      status: "failed",
    });
    mocks.getPagesForAudit.mockResolvedValue([
      {
        id: "page-1",
        url: "https://example.com/",
        statusCode: 200,
        fetchClass: "ok",
        title: "Home",
      },
      {
        id: "page-2",
        url: "https://example.com/about",
        statusCode: 200,
        fetchClass: "ok",
        title: "About",
      },
    ]);
    mocks.getLighthouseResultsForAudit.mockResolvedValue([
      {
        pageId: "page-1",
        strategy: "mobile",
        performanceScore: 88,
        accessibilityScore: 90,
        bestPracticesScore: 91,
        seoScore: 92,
        lcpMs: 1200,
        cls: 0.01,
        inpMs: 80,
        ttfbMs: 200,
        errorCode: null,
        errorMessage: null,
      },
      {
        pageId: "page-1",
        strategy: "desktop",
        performanceScore: 95,
        accessibilityScore: 90,
        bestPracticesScore: 91,
        seoScore: 92,
        lcpMs: 800,
        cls: 0.01,
        inpMs: 50,
        ttfbMs: 150,
        errorCode: null,
        errorMessage: null,
      },
    ]);
  });

  it("attaches stored Lighthouse scores on a failed audit", async () => {
    const result = await getAuditPagesTool.handler(
      { projectId: "project_1", auditId: "audit_1" },
      toolContext,
    );

    expect(result.structuredContent?.pages).toEqual([
      expect.objectContaining({
        id: "page-1",
        lighthouse: [
          expect.objectContaining({
            strategy: "mobile",
            performanceScore: 88,
          }),
          expect.objectContaining({
            strategy: "desktop",
            performanceScore: 95,
          }),
        ],
      }),
      expect.objectContaining({
        id: "page-2",
        lighthouse: [],
      }),
    ]);
    const text = result.content?.[0];
    expect(text?.type === "text" ? text.text : "").toContain(
      "2 Lighthouse check(s) stored",
    );
  });
});

describe("get_audit_status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.getStatus.mockResolvedValue({
      id: "audit_1",
      startUrl: "https://example.com/",
      status: "failed",
      pagesCrawled: 25,
      pagesTotal: 25,
      lighthouseTotal: 20,
      lighthouseCompleted: 8,
      lighthouseFailed: 0,
      currentPhase: "failed",
      errorCode: "workflow_internal",
      failedPhase: "lighthouse",
    });
  });

  it("points agents at get_audit_pages for stored Lighthouse checks", async () => {
    const result = await getAuditStatusTool.handler(
      { projectId: "project_1", auditId: "audit_1" },
      toolContext,
    );
    const text = result.content?.[0];
    expect(text?.type === "text" ? text.text : "").toContain(
      "get_audit_pages for stored Lighthouse scores",
    );
  });
});
