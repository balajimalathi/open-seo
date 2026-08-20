import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { getDataforseoAccountUsage } from "@/serverFunctions/dataforseo-account";
import type { DataforseoSpendWindow } from "@/shared/dataforseo-account-usage";

const DATAFORSEO_API_ACCESS_URL = "https://app.dataforseo.com/api-access";

export const Route = createFileRoute("/_app/billing")({
  component: DataforseoCreditsPage,
});

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "$0.00";
  return `$${value.toFixed(2)}`;
}

function DataforseoCreditsPage() {
  const usageQuery = useQuery({
    queryKey: ["dataforseoAccountUsage"],
    queryFn: () => getDataforseoAccountUsage(),
  });

  if (usageQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  if (usageQuery.isError) {
    return (
      <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <h1 className="text-2xl font-bold tracking-tight">
            DataForSEO credits
          </h1>
          <div className="alert alert-error text-sm">
            We couldn&apos;t load your DataForSEO account balance. Please try
            again.
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void usageQuery.refetch()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const usage = usageQuery.data;

  if (!usage?.configured) {
    return (
      <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-2xl font-bold tracking-tight">
            DataForSEO credits
          </h1>
          <div className="card border border-base-300 bg-base-100">
            <div className="card-body gap-3">
              <p className="text-sm text-base-content/70">
                Set <code>DATAFORSEO_API_KEY</code> to view your account balance
                and recent spend.
              </p>
              <Link to="/help/dataforseo-api-key" className="btn btn-primary btn-sm w-fit">
                Open setup guide
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              DataForSEO credits
            </h1>
            <p className="text-sm text-base-content/60">
              Balance and spend on the API key configured for this instance.
            </p>
          </div>
          <a
            href={DATAFORSEO_API_ACCESS_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm gap-1.5"
          >
            DataForSEO dashboard
            <ExternalLink className="size-3.5" />
          </a>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card border border-base-300 bg-base-100">
            <div className="card-body gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                Balance remaining
              </p>
              <p className="text-3xl font-semibold tracking-tight">
                {formatUsd(usage.balanceUsd)}
              </p>
            </div>
          </div>
          <div className="card border border-base-300 bg-base-100">
            <div className="card-body gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                Deposited total
              </p>
              <p className="text-3xl font-semibold tracking-tight">
                {formatUsd(usage.depositedTotalUsd)}
              </p>
            </div>
          </div>
        </div>

        {(usage.login || usage.timezone) && (
          <div className="text-sm text-base-content/60">
            {usage.login ? (
              <p>
                Login: <span className="text-base-content">{usage.login}</span>
              </p>
            ) : null}
            {usage.timezone ? (
              <p>
                Timezone:{" "}
                <span className="text-base-content">{usage.timezone}</span>
              </p>
            ) : null}
          </div>
        )}

        <SpendWindowCard
          title="Spend by function — rolling day"
          window={usage.day}
        />
        <SpendWindowCard
          title="Spend by function — rolling minute"
          window={usage.minute}
        />
      </div>
    </div>
  );
}

function SpendWindowCard({
  title,
  window,
}: {
  title: string;
  window: DataforseoSpendWindow | null;
}) {
  return (
    <section className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4">
        <div className="space-y-1">
          <h2 className="card-title text-base">{title}</h2>
          {window?.windowLabel ? (
            <p className="text-xs text-base-content/50">{window.windowLabel}</p>
          ) : null}
        </div>

        {!window || window.rows.length === 0 ? (
          <p className="text-sm text-base-content/60">
            No spend recorded in this window.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Function</th>
                  <th className="text-right">Spend</th>
                </tr>
              </thead>
              <tbody>
                {window.rows.map((row) => (
                  <tr key={row.function}>
                    <td>{row.function}</td>
                    <td className="text-right font-mono">
                      {formatUsd(row.spendUsd)}
                    </td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td>Total</td>
                  <td className="text-right font-mono">
                    {formatUsd(window.totalUsd)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
