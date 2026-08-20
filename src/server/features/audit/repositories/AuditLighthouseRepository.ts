import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { audits, auditLighthouseResults, auditPages } from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";
import { deterministicAuditRowId } from "@/server/lib/audit/ids";
import type { LighthouseResult } from "@/server/lib/audit/types";

export type StoredLighthouseResult = typeof auditLighthouseResults.$inferSelect;

async function insertLighthouseResults(
  auditId: string,
  lighthouseResults: LighthouseResult[],
) {
  const rows = await Promise.all(
    lighthouseResults.map(async (result) => ({
      id: await deterministicAuditRowId(
        auditId,
        result.pageId,
        result.strategy,
      ),
      auditId,
      pageId: result.pageId,
      strategy: result.strategy,
      performanceScore: result.performanceScore,
      accessibilityScore: result.accessibilityScore,
      bestPracticesScore: result.bestPracticesScore,
      seoScore: result.seoScore,
      lcpMs: result.lcpMs,
      cls: result.cls,
      inpMs: result.inpMs,
      ttfbMs: result.ttfbMs,
      errorMessage: result.errorMessage ?? null,
      errorCode: result.errorCode ?? null,
      costUsd: result.costUsd ?? null,
      creditsCharged: result.creditsCharged ?? null,
      r2Key: result.r2Key ?? null,
      payloadSizeBytes: result.payloadSizeBytes ?? null,
    })),
  );
  // The persistence step is retryable after its paid provider result has been
  // checkpointed, so repeated writes must stay idempotent. creditsCharged is
  // set on first insert only — a replay must not overwrite a recorded charge.
  await executeInBatches(rows, (tx, row) => {
    const {
      id: _id,
      auditId: _auditId,
      creditsCharged: _creditsCharged,
      ...dataColumns
    } = row;
    return tx.insert(auditLighthouseResults).values(row).onConflictDoUpdate({
      target: auditLighthouseResults.id,
      set: dataColumns,
    });
  });
}

async function getLighthouseResultsForPage(auditId: string, pageId: string) {
  return db.query.auditLighthouseResults.findMany({
    where: and(
      eq(auditLighthouseResults.auditId, auditId),
      eq(auditLighthouseResults.pageId, pageId),
    ),
  });
}

async function getLighthouseResultsForPages(
  auditId: string,
  pageIds: string[],
) {
  if (pageIds.length === 0) return [];
  return db.query.auditLighthouseResults.findMany({
    where: and(
      eq(auditLighthouseResults.auditId, auditId),
      inArray(auditLighthouseResults.pageId, pageIds),
    ),
  });
}

async function getLighthouseResultsForAudit(auditId: string) {
  return db
    .select({
      pageId: auditLighthouseResults.pageId,
      strategy: auditLighthouseResults.strategy,
      performanceScore: auditLighthouseResults.performanceScore,
      accessibilityScore: auditLighthouseResults.accessibilityScore,
      bestPracticesScore: auditLighthouseResults.bestPracticesScore,
      seoScore: auditLighthouseResults.seoScore,
      lcpMs: auditLighthouseResults.lcpMs,
      cls: auditLighthouseResults.cls,
      inpMs: auditLighthouseResults.inpMs,
      ttfbMs: auditLighthouseResults.ttfbMs,
      errorCode: auditLighthouseResults.errorCode,
      errorMessage: auditLighthouseResults.errorMessage,
    })
    .from(auditLighthouseResults)
    .where(eq(auditLighthouseResults.auditId, auditId));
}

async function getLighthouseBillingSummary(auditId: string) {
  const rows = await db
    .select({
      creditsCharged: auditLighthouseResults.creditsCharged,
    })
    .from(auditLighthouseResults)
    .where(eq(auditLighthouseResults.auditId, auditId));
  return {
    checksStored: rows.length,
    creditsCharged: rows.reduce(
      (total, row) => total + (row.creditsCharged ?? 0),
      0,
    ),
  };
}

async function getLighthouseResultById(input: {
  lighthouseResultId: string;
  projectId: string;
}) {
  const lighthouse = await db.query.auditLighthouseResults.findFirst({
    where: eq(auditLighthouseResults.id, input.lighthouseResultId),
  });

  if (!lighthouse) {
    return null;
  }

  const [parentAudit, page] = await Promise.all([
    db.query.audits.findFirst({
      where: and(
        eq(audits.id, lighthouse.auditId),
        eq(audits.projectId, input.projectId),
      ),
    }),
    db.query.auditPages.findFirst({
      where: eq(auditPages.id, lighthouse.pageId),
    }),
  ]);

  if (!parentAudit) {
    return null;
  }

  return {
    lighthouse,
    page,
    audit: parentAudit,
  };
}

export const AuditLighthouseRepository = {
  insertLighthouseResults,
  getLighthouseResultsForPage,
  getLighthouseResultsForPages,
  getLighthouseResultsForAudit,
  getLighthouseBillingSummary,
  getLighthouseResultById,
} as const;
