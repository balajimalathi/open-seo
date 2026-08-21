import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/lib/errors";
import { GoogleGrantService } from "./GoogleGrantService";

const mocks = vi.hoisted(() => {
  const state: { grants: Array<{ id: string; accountId: string }> } = {
    grants: [],
  };
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  return {
    state,
    deleteWhere,
    dbSelect: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = state.grants;
          return Object.assign(Promise.resolve(rows), {
            limit: vi.fn().mockResolvedValue(rows),
          });
        }),
      })),
    })),
    dbDelete: vi.fn(() => ({ where: deleteWhere })),
    deleteByConnectorAccountGsc: vi.fn(),
    deleteByGoogleAccountIdGsc: vi.fn(),
    deleteByConnectorAccountGa4: vi.fn(),
    deleteByGoogleAccountIdGa4: vi.fn(),
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({
  db: { select: mocks.dbSelect, delete: mocks.dbDelete },
}));
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: {
    deleteByConnectorAccount: mocks.deleteByConnectorAccountGsc,
    deleteByGoogleAccountId: mocks.deleteByGoogleAccountIdGsc,
  },
}));
vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: {
    deleteByConnectorAccount: mocks.deleteByConnectorAccountGa4,
    deleteByGoogleAccountId: mocks.deleteByGoogleAccountIdGa4,
  },
}));

describe("GoogleGrantService", () => {
  beforeEach(() => {
    mocks.state.grants = [{ id: "grant-1", accountId: "sub-a" }];
    mocks.deleteWhere.mockClear();
    mocks.dbDelete.mockClear();
    mocks.deleteByConnectorAccountGsc.mockReset().mockResolvedValue(undefined);
    mocks.deleteByGoogleAccountIdGsc.mockReset().mockResolvedValue(undefined);
    mocks.deleteByConnectorAccountGa4.mockReset().mockResolvedValue(undefined);
    mocks.deleteByGoogleAccountIdGa4.mockReset().mockResolvedValue(undefined);
  });

  it("disconnects an owned grant without requiring a project mapping", async () => {
    await GoogleGrantService.disconnectOwnGrant({
      userId: "u1",
      providerId: "google-search-console",
      googleAccountId: "sub-a",
    });

    expect(mocks.deleteByConnectorAccountGsc).toHaveBeenCalledWith(
      "u1",
      "sub-a",
    );
    expect(mocks.deleteByGoogleAccountIdGsc).not.toHaveBeenCalled();
    expect(mocks.dbDelete).toHaveBeenCalledTimes(1);
  });

  it("refuses to disconnect a grant the caller does not own", async () => {
    mocks.state.grants = [];

    await expect(
      GoogleGrantService.disconnectOwnGrant({
        userId: "u1",
        providerId: "google-search-console",
        googleAccountId: "sub-a",
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(mocks.deleteByConnectorAccountGsc).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("releases another user's grant after Google identity proof", async () => {
    await GoogleGrantService.releaseGrantForGoogleAccount({
      providerId: "google-search-console",
      googleAccountId: "sub-a",
    });

    expect(mocks.deleteByGoogleAccountIdGsc).toHaveBeenCalledWith("sub-a");
    expect(mocks.deleteByConnectorAccountGsc).not.toHaveBeenCalled();
    expect(mocks.dbDelete).toHaveBeenCalledTimes(1);
  });

  it("mirrors release onto the GA4 connector tables", async () => {
    await GoogleGrantService.releaseGrantForGoogleAccount({
      providerId: "google-analytics",
      googleAccountId: "sub-ga",
    });

    expect(mocks.deleteByGoogleAccountIdGa4).toHaveBeenCalledWith("sub-ga");
    expect(mocks.deleteByGoogleAccountIdGsc).not.toHaveBeenCalled();
  });
});
