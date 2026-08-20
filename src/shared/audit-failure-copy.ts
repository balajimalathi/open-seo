export const AUDIT_ERROR_CODE_COPY: Record<string, string> = {
  step_timeout: "A step timed out before the audit could finish.",
  oom: "The audit ran out of memory.",
  cpu_limit: "The audit hit a CPU time limit.",
  db_error: "A database error stopped the audit.",
  step_output_too_large: "A step produced more data than the runner can store.",
  workflow_internal: "The audit runner hit an internal error.",
  instance_lost: "The audit runner stopped unexpectedly.",
  unknown: "The audit stopped unexpectedly.",
};

export const LIGHTHOUSE_SAMPLE_ERROR_COPY: Record<string, string> = {
  provider_error: "Lighthouse provider error",
  provider_timeout: "Lighthouse timed out",
  invalid_request: "Invalid Lighthouse request",
  payload_parse: "Lighthouse response was unusable",
  unknown: "Lighthouse check failed",
};

export function failedAuditBannerCopy(input: {
  pageCount: number;
  lighthouseStored: number;
  lighthouseTotal: number;
  creditsCharged: number;
  errorCode: string | null;
  failedPhase: string | null;
  hosted: boolean;
}): { title: string; body: string } {
  const title = bannerTitle(input);
  const reason = input.errorCode
    ? (AUDIT_ERROR_CODE_COPY[input.errorCode] ?? AUDIT_ERROR_CODE_COPY.unknown)
    : null;
  const billing = billingSentence(input);
  const body = [
    reason,
    billing,
    "The results below cover everything stored before it stopped. Run a new audit to try again.",
  ]
    .filter(Boolean)
    .join(" ");
  return { title, body };
}

function bannerTitle(input: {
  pageCount: number;
  lighthouseStored: number;
  lighthouseTotal: number;
  failedPhase: string | null;
}): string {
  if (input.failedPhase === "lighthouse" && input.lighthouseTotal > 0) {
    return `This audit stopped during Lighthouse after ${input.lighthouseStored} of ${input.lighthouseTotal} checks.`;
  }
  if (input.pageCount > 0) {
    return `This audit stopped early after ${input.pageCount} page${input.pageCount === 1 ? "" : "s"}.`;
  }
  return "This audit stopped early.";
}

function billingSentence(input: {
  lighthouseStored: number;
  lighthouseTotal: number;
  creditsCharged: number;
  hosted: boolean;
}): string | null {
  if (input.lighthouseTotal <= 0) return null;
  const notRun = Math.max(0, input.lighthouseTotal - input.lighthouseStored);
  if (input.lighthouseStored === 0) {
    return notRun > 0
      ? `${notRun} Lighthouse check${notRun === 1 ? " was" : "s were"} not run and ${notRun === 1 ? "was" : "were"} not charged.`
      : null;
  }
  const charged = input.hosted
    ? `You were charged ${input.creditsCharged} credit${input.creditsCharged === 1 ? "" : "s"} for ${input.lighthouseStored} Lighthouse check${input.lighthouseStored === 1 ? "" : "s"}.`
    : `DataForSEO billed ${input.lighthouseStored} Lighthouse check${input.lighthouseStored === 1 ? "" : "s"}.`;
  const remainder =
    notRun > 0
      ? ` The remaining ${notRun} ${notRun === 1 ? "was" : "were"} not run and ${notRun === 1 ? "was" : "were"} not charged.`
      : "";
  return charged + remainder;
}
