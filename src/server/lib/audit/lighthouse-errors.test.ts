import { describe, expect, it } from "vitest";
import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";
import { classifyLighthouseSampleError } from "@/server/lib/audit/lighthouse-errors";

describe("classifyLighthouseSampleError", () => {
  it("maps unbilled invalid-field failures to invalid_request", () => {
    const classified = classifyLighthouseSampleError(
      new AppError("VALIDATION_ERROR", "Invalid Field: 'url'."),
    );
    expect(classified.errorCode).toBe("invalid_request");
    expect(classified.costUsd).toBeNull();
  });

  it("maps billed parse failures to payload_parse", () => {
    const classified = classifyLighthouseSampleError(
      new DataforseoChargedTaskError(
        "DataForSEO Lighthouse returned an invalid response: tasks: Required",
        { costUsd: 0.004, path: ["v3", "on_page", "lighthouse", "live"] },
      ),
    );
    expect(classified.errorCode).toBe("payload_parse");
    expect(classified.costUsd).toBe(0.004);
  });

  it("maps billed provider task failures to provider_error", () => {
    const classified = classifyLighthouseSampleError(
      new DataforseoChargedTaskError("DataForSEO Lighthouse task failed", {
        costUsd: 0.004,
        path: ["v3", "on_page", "lighthouse", "live"],
      }),
    );
    expect(classified.errorCode).toBe("provider_error");
  });

  it("maps timeouts to provider_timeout", () => {
    expect(
      classifyLighthouseSampleError(new Error("ETIMEDOUT")).errorCode,
    ).toBe("provider_timeout");
  });
});
