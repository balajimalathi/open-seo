import { describe, expect, it } from "vitest";
import type { AppendixStatisticsRatesDataInfo } from "dataforseo-client";
import { mapDataforseoAccountUsage } from "./dataforseo-account-usage";

describe("mapDataforseoAccountUsage", () => {
  it("maps login, balance, and function spend from user_data", () => {
    const dayStats = {
      value: "2026-08-20",
      total_serp: 1.25,
      total_backlinks: 0.5,
      total: 1.75,
    } as AppendixStatisticsRatesDataInfo;

    const dto = mapDataforseoAccountUsage({
      login: "alice@example.com",
      timezone: "UTC",
      money: {
        total: 100,
        balance: 42.5,
        statistics: {
          day: dayStats,
        },
      },
    });

    expect(dto).toEqual({
      configured: true,
      login: "alice@example.com",
      timezone: "UTC",
      depositedTotalUsd: 100,
      balanceUsd: 42.5,
      day: {
        windowLabel: "2026-08-20",
        rows: [
          { function: "serp", spendUsd: 1.25 },
          { function: "backlinks", spendUsd: 0.5 },
        ],
        totalUsd: 1.75,
      },
      minute: null,
    });
  });
});
