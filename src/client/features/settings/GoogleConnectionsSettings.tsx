import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  GoogleAnalyticsLogo,
  GoogleSearchConsoleLogo,
} from "@/client/features/integrations/GoogleProductLogos";
import { startGoogleGrantRelease } from "@/client/features/integrations/startGoogleLink";
import { useGoogleOAuthCallbackFeedback } from "@/client/features/integrations/useGoogleOAuthCallbackFeedback";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { disconnectOwnGa4Grant, listGa4Grants } from "@/serverFunctions/ga4";
import { disconnectOwnGscGrant, listGscGrants } from "@/serverFunctions/gsc";

const GSC_GRANTS_KEY = ["gscGrants"];
const GA4_GRANTS_KEY = ["ga4Grants"];
const GRANT_STATUS_KEY = ["gscGrantStatus"];

export function GoogleConnectionsSettings() {
  useGoogleOAuthCallbackFeedback();

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-base-content/50">
        Google connections
      </h2>
      <p className="text-sm text-base-content/60">
        Disconnect a Search Console or Analytics grant without a project
        mapping, or release a grant stuck on a different OpenSEO user by signing
        in with that Google account.
      </p>
      <GrantCard
        title="Google Search Console"
        icon={<GoogleSearchConsoleLogo className="size-5" />}
        queryKey={GSC_GRANTS_KEY}
        list={listGscGrants}
        disconnect={disconnectOwnGscGrant}
        provider="gsc"
        releaseLabel="Disconnect Search Console grant"
      />
      <GrantCard
        title="Google Analytics"
        icon={<GoogleAnalyticsLogo className="size-5" />}
        queryKey={GA4_GRANTS_KEY}
        list={listGa4Grants}
        disconnect={disconnectOwnGa4Grant}
        provider="ga4"
        releaseLabel="Disconnect Analytics grant"
      />
    </section>
  );
}

function GrantCard({
  title,
  icon,
  queryKey,
  list,
  disconnect,
  provider,
  releaseLabel,
}: {
  title: string;
  icon: ReactNode;
  queryKey: string[];
  list: () => Promise<{
    grants: Array<{ accountId: string; email: string | null }>;
  }>;
  disconnect: (opts: {
    data: { accountId?: string };
  }) => Promise<{ connected: false }>;
  provider: "gsc" | "ga4";
  releaseLabel: string;
}) {
  const queryClient = useQueryClient();
  const grantsQuery = useQuery({
    queryKey,
    queryFn: () => list(),
  });
  const grants = grantsQuery.data?.grants ?? [];

  const disconnectMutation = useMutation({
    mutationFn: (accountId: string) => disconnect({ data: { accountId } }),
    onSuccess: () => {
      toast.success(`${title} disconnected`);
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: GRANT_STATUS_KEY });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-sm">
      <div className="flex items-center gap-2.5 p-4 sm:p-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-base-300 bg-base-100 shadow-sm">
          {icon}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-3 border-t border-base-300 p-4 sm:p-5">
        {grantsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-base-content/50">
            <span className="loading loading-spinner loading-sm" />
            Checking…
          </div>
        ) : grants.length > 0 ? (
          grants.map((grant) => (
            <div
              key={grant.accountId}
              className="flex items-center justify-between gap-3"
            >
              <p className="min-w-0 truncate font-mono text-sm text-base-content/70">
                {grant.email ?? grant.accountId}
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-sm shrink-0 text-error hover:bg-error/10"
                disabled={
                  disconnectMutation.isPending &&
                  disconnectMutation.variables === grant.accountId
                }
                onClick={() => disconnectMutation.mutate(grant.accountId)}
              >
                Disconnect
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-base-content/60">
            No {title} grant on this OpenSEO user.
          </p>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm h-auto min-h-0 px-0 py-0 font-medium text-base-content/70"
          onClick={() =>
            void startGoogleGrantRelease(provider, window.location.href)
          }
        >
          {releaseLabel}
        </button>
      </div>
    </div>
  );
}
