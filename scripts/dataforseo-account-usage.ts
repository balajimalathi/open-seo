import process from "node:process";
import type { AppendixStatisticsRatesDataInfo } from "dataforseo-client";
import { fetchUserData } from "@/server/lib/dataforseo/appendix";
import {
  DATAFORSEO_FUNCTION_TOTALS,
  mapDataforseoAccountUsage,
} from "@/shared/dataforseo-account-usage";
import { loadLocalEnv, parseArgs } from "./cli-utils";

loadLocalEnv();

const args = parseArgs(process.argv.slice(2));

await main();

/**
 * Inspect real DataForSEO account spend via the FREE GET
 * /v3/appendix/user_data endpoint. Unlike the other billing:* scripts, this
 * makes NO billable calls — it just reads the numbers DataForSEO already
 * tracks: lifetime deposit, remaining balance, and per-function spend for the
 * rolling day / minute window.
 *
 * Usage: pnpm billing:usage [--json=true]
 */
async function main() {
  if (!process.env.DATAFORSEO_API_KEY) {
    printUsageAndExit("Missing DATAFORSEO_API_KEY.");
  }

  const account = await fetchUserData();
  if (!account) {
    console.error(
      "DataForSEO returned no account data (empty result). Check the API key.",
    );
    process.exit(1);
  }

  if (args.json === "true") {
    console.log(JSON.stringify(account, null, 2));
    return;
  }

  const usage = mapDataforseoAccountUsage(account);
  console.log("DataForSEO account usage");
  console.log("========================");
  console.log(`Login:            ${usage.login ?? "(unknown)"}`);
  if (usage.timezone) console.log(`Timezone:         ${usage.timezone}`);
  console.log(`Deposited total:  ${formatUsd(usage.depositedTotalUsd)}`);
  console.log(`Balance left:     ${formatUsd(usage.balanceUsd)}`);

  printFunctionTable("Spend by function — rolling DAY", account.money?.statistics?.day);
  printFunctionTable(
    "Spend by function — rolling MINUTE",
    account.money?.statistics?.minute,
  );
}

function printFunctionTable(
  heading: string,
  stats: AppendixStatisticsRatesDataInfo | undefined,
) {
  console.log("");
  console.log(heading);
  console.log("-".repeat(heading.length));
  if (!stats) {
    console.log("(no data)");
    return;
  }
  if (stats.value) console.log(`Window: ${stats.value}`);

  const rows = DATAFORSEO_FUNCTION_TOTALS.map(({ label, key }) => ({
    function: label,
    spend: readNumber(stats[key]),
  })).filter((row) => row.spend > 0);

  if (rows.length === 0) {
    console.log("(no spend recorded in this window)");
  } else {
    for (const row of rows) {
      console.log(`  ${row.function.padEnd(20)} ${formatUsd(row.spend)}`);
    }
  }

  const total =
    readNumber(stats.total) || rows.reduce((sum, row) => sum + row.spend, 0);
  console.log(`  ${"TOTAL".padEnd(20)} ${formatUsd(total)}`);
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "$0.00";
  return `$${value.toFixed(2)}`;
}

function printUsageAndExit(message: string): never {
  console.error(message);
  console.error("Usage: pnpm billing:usage [--json=true]");
  process.exit(1);
}
