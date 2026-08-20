import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOrCreateMock, kvGetMock, kvPutMock } = vi.hoisted(() => ({
  getOrCreateMock: vi.fn(),
  kvGetMock: vi.fn(),
  kvPutMock: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: { KV: { get: kvGetMock, put: kvPutMock } },
}));

vi.mock("@/server/billing/autumn", () => ({
  autumn: {
    check: vi.fn(),
    customers: {
      getOrCreate: getOrCreateMock,
    },
  },
}));

vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: vi.fn(),
}));

vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: vi.fn(),
}));

import {
  assertUsageCreditsAvailable,
  checkUsageCreditsDepleted,
  customerHasManagedAccess,
  customerHasPaidPlan,
  getOrCreateOrganizationCustomer,
  trackUsageCreditSpend,
} from "./subscription";

describe("subscription billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kvGetMock.mockResolvedValue(null);
    kvPutMock.mockResolvedValue(undefined);
  });

  it("always grants paid plan access", async () => {
    await expect(customerHasPaidPlan("org_123")).resolves.toBe(true);
    await expect(
      customerHasPaidPlan("org_123", { retryDenied: true }),
    ).resolves.toBe(true);
  });

  it("always grants managed access", async () => {
    await expect(customerHasManagedAccess("org_123")).resolves.toBe(true);
  });

  it("never treats usage credits as depleted", async () => {
    await expect(
      checkUsageCreditsDepleted({
        organizationId: "org_123",
        userId: "user_123",
        userEmail: "alice@example.com",
      }),
    ).resolves.toEqual({
      depleted: false,
      monthlyRemaining: Number.POSITIVE_INFINITY,
    });
  });

  it("always allows usage credit spend", async () => {
    await expect(assertUsageCreditsAvailable("org_123")).resolves.toEqual({
      monthlyRemaining: Number.POSITIVE_INFINITY,
    });
  });

  it("no-ops trackUsageCreditSpend", async () => {
    await expect(
      trackUsageCreditSpend({
        customer: {
          organizationId: "org_123",
          userId: "user_123",
          userEmail: "alice@example.com",
        },
        customerId: "org_123",
        creditFeature: "backlinks",
        costUsd: 0.05,
        monthlyRemaining: 100,
      }),
    ).resolves.toBeUndefined();
  });

  it("looks up the billing customer by organization id", async () => {
    getOrCreateMock.mockResolvedValue({ id: "cust_123" });

    await getOrCreateOrganizationCustomer({
      organizationId: "org_123",
      userId: "user_123",
      userEmail: "alice@example.com",
    });

    expect(getOrCreateMock).toHaveBeenCalledWith({
      customerId: "org_123",
      email: "alice@example.com",
    });
    expect(kvPutMock).toHaveBeenCalled();
  });

  it("skips the Autumn round trip when the customer was recently ensured", async () => {
    kvGetMock.mockResolvedValue("1");

    const result = await getOrCreateOrganizationCustomer({
      organizationId: "org_123",
      userId: "user_123",
      userEmail: "alice@example.com",
    });

    expect(result).toEqual({ id: "org_123" });
    expect(getOrCreateMock).not.toHaveBeenCalled();
  });

  it("falls back to Autumn when the customer cache read fails", async () => {
    const cacheError = new Error("KV read unavailable");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    kvGetMock.mockRejectedValue(cacheError);
    getOrCreateMock.mockResolvedValue({ id: "cust_123" });

    await expect(
      getOrCreateOrganizationCustomer({
        organizationId: "org_123",
        userId: "user_123",
        userEmail: "alice@example.com",
      }),
    ).resolves.toEqual({ id: "cust_123" });

    expect(getOrCreateMock).toHaveBeenCalledWith({
      customerId: "org_123",
      email: "alice@example.com",
    });
    expect(console.warn).toHaveBeenCalledWith(
      "billing.customer-cache-read failed:",
      cacheError,
    );
  });

  it("returns the resolved customer when the customer cache write fails", async () => {
    const cacheError = new Error("KV write unavailable");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getOrCreateMock.mockResolvedValue({ id: "cust_123" });
    kvPutMock.mockRejectedValue(cacheError);

    await expect(
      getOrCreateOrganizationCustomer({
        organizationId: "org_123",
        userId: "user_123",
        userEmail: "alice@example.com",
      }),
    ).resolves.toEqual({ id: "cust_123" });

    expect(console.warn).toHaveBeenCalledWith(
      "billing.customer-cache-write failed:",
      cacheError,
    );
  });
});
