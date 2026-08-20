import {
  assertUsageCreditsAvailable,
  trackUsageCreditSpend,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  AuditLighthouseRepository,
  type StoredLighthouseResult,
} from "@/server/features/audit/repositories/AuditLighthouseRepository";
import {
  fetchLighthouseResult,
  type LighthouseFetchResult,
} from "@/server/lib/audit/lighthouse";
import type { LighthouseResult } from "@/server/lib/audit/types";
import { seoDataCreditsFromUsd } from "@/shared/billing";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

function storedLighthouseToFetchResult(
  url: string,
  row: StoredLighthouseResult,
): LighthouseFetchResult {
  return {
    result: {
      url,
      pageId: row.pageId,
      strategy: row.strategy,
      performanceScore: row.performanceScore,
      accessibilityScore: row.accessibilityScore,
      bestPracticesScore: row.bestPracticesScore,
      seoScore: row.seoScore,
      lcpMs: row.lcpMs,
      cls: row.cls,
      inpMs: row.inpMs,
      ttfbMs: row.ttfbMs,
      errorMessage: row.errorMessage,
      errorCode: row.errorCode as LighthouseResult["errorCode"],
      costUsd: row.costUsd,
      creditsCharged: row.creditsCharged,
      r2Key: row.r2Key,
      payloadSizeBytes: row.payloadSizeBytes,
    },
    costUsd: row.costUsd,
  };
}

/** Reuse stored samples instead of re-buying them; otherwise fetch + R2. */
export async function fetchLighthousePair(input: {
  url: string;
  pageId: string;
  projectId: string;
  auditId: string;
}): Promise<[LighthouseFetchResult, LighthouseFetchResult]> {
  const existing = await AuditLighthouseRepository.getLighthouseResultsForPage(
    input.auditId,
    input.pageId,
  );
  const byStrategy = new Map(existing.map((row) => [row.strategy, row]));
  const storage = { projectId: input.projectId, auditId: input.auditId };

  const fetchOne = (strategy: "mobile" | "desktop") => {
    const stored = byStrategy.get(strategy);
    if (stored) return storedLighthouseToFetchResult(input.url, stored);
    return fetchLighthouseResult(input.url, input.pageId, strategy, storage);
  };

  return Promise.all([fetchOne("mobile"), fetchOne("desktop")]);
}

export async function persistLighthouseResults(input: {
  auditId: string;
  workflowInstanceId: string;
  billingCustomer: BillingCustomerContext;
  fetched: LighthouseFetchResult[];
  priorCompleted: number;
  priorFailed: number;
}): Promise<{ completed: number; failed: number }> {
  const hosted = await isHostedServerAuthMode();
  const existing = await AuditLighthouseRepository.getLighthouseResultsForPages(
    input.auditId,
    input.fetched.map((item) => item.result.pageId),
  );
  const existingByKey = new Map(
    existing.map((row) => [`${row.pageId}:${row.strategy}`, row]),
  );

  const results = input.fetched.map((item) => {
    const stored = existingByKey.get(
      `${item.result.pageId}:${item.result.strategy}`,
    );
    const creditsCharged =
      stored?.creditsCharged ??
      seoDataCreditsFromUsd(item.costUsd ?? 0, hosted);
    return {
      ...item.result,
      costUsd: item.costUsd,
      creditsCharged,
    };
  });

  await AuditLighthouseRepository.insertLighthouseResults(
    input.auditId,
    results,
  );

  let monthlyRemaining: number | undefined;
  for (const item of input.fetched) {
    const stored = existingByKey.get(
      `${item.result.pageId}:${item.result.strategy}`,
    );
    const costUsd = item.costUsd ?? 0;
    if (stored?.creditsCharged != null || costUsd <= 0) continue;
    monthlyRemaining ??= (
      await assertUsageCreditsAvailable(input.billingCustomer.organizationId)
    ).monthlyRemaining;
    await trackUsageCreditSpend({
      customer: input.billingCustomer,
      customerId: input.billingCustomer.organizationId,
      creditFeature: "site_audit",
      costUsd,
      monthlyRemaining,
      properties: {
        audit_id: input.auditId,
        page_id: item.result.pageId,
        strategy: item.result.strategy,
      },
    });
  }

  const failed = results.filter((result) => result.errorMessage).length;
  const completed = results.length - failed;
  await AuditRepository.updateAuditProgress(
    input.auditId,
    input.workflowInstanceId,
    {
      lighthouseCompleted: input.priorCompleted + completed,
      lighthouseFailed: input.priorFailed + failed,
    },
  );
  return { completed, failed };
}
