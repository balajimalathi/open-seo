import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";
import type { LighthouseSampleErrorCode } from "@/server/lib/audit/types";

export interface LighthouseSampleErrorInfo {
  errorCode: LighthouseSampleErrorCode;
  errorMessage: string;
  costUsd: number | null;
}

export function classifyLighthouseSampleError(
  error: unknown,
): LighthouseSampleErrorInfo {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const costUsd =
    error instanceof DataforseoChargedTaskError ? error.billing.costUsd : null;

  return {
    errorCode: classifyMessage(error, errorMessage),
    errorMessage,
    costUsd,
  };
}

function classifyMessage(
  error: unknown,
  message: string,
): LighthouseSampleErrorCode {
  if (error instanceof AppError && error.code === "VALIDATION_ERROR") {
    return "invalid_request";
  }
  if (error instanceof DataforseoChargedTaskError && error.isInvalidField) {
    return "invalid_request";
  }
  if (
    error instanceof DataforseoChargedTaskError &&
    /invalid response|missing task|unusable payload/i.test(message)
  ) {
    return "payload_parse";
  }
  if (
    /timed out|timeout|ETIMEDOUT|AbortError/i.test(message) ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return "provider_timeout";
  }
  if (
    error instanceof DataforseoChargedTaskError ||
    /DataForSEO|Lighthouse/i.test(message)
  ) {
    return "provider_error";
  }
  return "unknown";
}
