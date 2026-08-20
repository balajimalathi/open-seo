import { describe, expect, it } from "vitest";
import { failedAuditBannerCopy } from "@/shared/audit-failure-copy";

describe("failedAuditBannerCopy", () => {
  it("tells hosted users what they were and were not charged for", () => {
    const copy = failedAuditBannerCopy({
      pageCount: 25,
      lighthouseStored: 8,
      lighthouseTotal: 20,
      creditsCharged: 70,
      errorCode: "workflow_internal",
      failedPhase: "lighthouse",
      hosted: true,
    });

    expect(copy.title).toBe(
      "This audit stopped during Lighthouse after 8 of 20 checks.",
    );
    expect(copy.body).toContain("The audit runner hit an internal error.");
    expect(copy.body).toContain(
      "You were charged 70 credits for 8 Lighthouse checks.",
    );
    expect(copy.body).toContain(
      "The remaining 12 were not run and were not charged.",
    );
  });

  it("uses DataForSEO billing language on self-host", () => {
    const copy = failedAuditBannerCopy({
      pageCount: 25,
      lighthouseStored: 8,
      lighthouseTotal: 20,
      creditsCharged: 70,
      errorCode: "workflow_internal",
      failedPhase: "lighthouse",
      hosted: false,
    });

    expect(copy.body).toContain("DataForSEO billed 8 Lighthouse checks.");
    expect(copy.body).not.toContain("credit");
  });
});
