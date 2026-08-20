import type { AppendixStatisticsRatesDataInfo } from "dataforseo-client";

/** DataForSEO groups spend under `total_<function>` keys on each statistics window. */
export const DATAFORSEO_FUNCTION_TOTALS: ReadonlyArray<{
  label: string;
  key: string;
}> = [
  { label: "serp", key: "total_serp" },
  { label: "keywords_data", key: "total_keywords_data" },
  { label: "dataforseo_labs", key: "total_dataforseo_labs" },
  { label: "backlinks", key: "total_backlinks" },
  { label: "on_page", key: "total_on_page" },
  { label: "business_data", key: "total_business_data" },
  { label: "domain_analytics", key: "total_domain_analytics" },
  { label: "merchant", key: "total_merchant" },
  { label: "app_data", key: "total_app_data" },
  { label: "content_analysis", key: "total_content_analysis" },
  { label: "content_generation", key: "total_content_generation" },
  { label: "appendix", key: "total_appendix" },
];

export type DataforseoFunctionSpendRow = {
  function: string;
  spendUsd: number;
};

export type DataforseoSpendWindow = {
  windowLabel: string | null;
  rows: DataforseoFunctionSpendRow[];
  totalUsd: number;
};

export type DataforseoAccountUsageDto = {
  configured: boolean;
  login: string | null;
  timezone: string | null;
  depositedTotalUsd: number | null;
  balanceUsd: number | null;
  day: DataforseoSpendWindow | null;
  minute: DataforseoSpendWindow | null;
};

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function mapStatisticsWindow(
  stats: AppendixStatisticsRatesDataInfo | undefined,
): DataforseoSpendWindow | null {
  if (!stats) return null;

  const rows = DATAFORSEO_FUNCTION_TOTALS.map(({ label, key }) => ({
    function: label,
    spendUsd: readNumber(stats[key]),
  })).filter((row) => row.spendUsd > 0);

  const totalUsd =
    readNumber(stats.total) ||
    rows.reduce((sum, row) => sum + row.spendUsd, 0);

  return {
    windowLabel: typeof stats.value === "string" ? stats.value : null,
    rows,
    totalUsd,
  };
}

export function mapDataforseoAccountUsage(account: {
  login?: string | null;
  timezone?: string | null;
  money?: {
    total?: number | null;
    balance?: number | null;
    statistics?: {
      day?: AppendixStatisticsRatesDataInfo;
      minute?: AppendixStatisticsRatesDataInfo;
    };
  } | null;
}): DataforseoAccountUsageDto {
  const money = account.money;
  return {
    configured: true,
    login: account.login ?? null,
    timezone: account.timezone ?? null,
    depositedTotalUsd:
      typeof money?.total === "number" && Number.isFinite(money.total)
        ? money.total
        : null,
    balanceUsd:
      typeof money?.balance === "number" && Number.isFinite(money.balance)
        ? money.balance
        : null,
    day: mapStatisticsWindow(money?.statistics?.day),
    minute: mapStatisticsWindow(money?.statistics?.minute),
  };
}

export function notConfiguredDataforseoAccountUsage(): DataforseoAccountUsageDto {
  return {
    configured: false,
    login: null,
    timezone: null,
    depositedTotalUsd: null,
    balanceUsd: null,
    day: null,
    minute: null,
  };
}
