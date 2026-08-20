import { env } from "cloudflare:workers";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { autumn } from "@/server/billing/autumn";
import { AppError } from "@/server/lib/errors";

export type BillingCustomerContext = Pick<
  EnsuredUserContext,
  "organizationId" | "userEmail" | "userId"
> & {
  projectId?: string;
};

// Existence is monotonic and the Autumn customer id is always the org id we
// pass, so once we've confirmed a customer exists we can skip the round trip
// and reuse the org id. Callers only need `.id` (they read balances via
// `check`), and a degraded Autumn API otherwise added seconds to every hot-path
// request that ensured the customer (incident 2026-07-06). Long TTL is safe:
// we only ever cache confirmed existence, never absence.
const CUSTOMER_ENSURED_TTL_SECONDS = 24 * 60 * 60;
const customerEnsuredKey = (organizationId: string) =>
  `autumn:customer-ensured:${organizationId}`;

export async function getOrCreateOrganizationCustomer(
  context: BillingCustomerContext,
): Promise<{ id: string }> {
  const cacheKey = customerEnsuredKey(context.organizationId);
  try {
    if (await env.KV.get(cacheKey)) {
      return { id: context.organizationId };
    }
  } catch (error) {
    console.warn("billing.customer-cache-read failed:", error);
  }

  const customer = await autumn.customers.getOrCreate({
    customerId: context.organizationId,
    email: context.userEmail,
  });

  if (!customer.id) {
    throw new AppError("INTERNAL_ERROR", "Failed to resolve billing customer");
  }

  try {
    await env.KV.put(cacheKey, "1", {
      expirationTtl: CUSTOMER_ENSURED_TTL_SECONDS,
    });
  } catch (error) {
    console.warn("billing.customer-cache-write failed:", error);
  }

  return { id: customer.id };
}

// Personal / single-operator deployments do not use Autumn plans. Always
// grant paid + managed access so features are not gated on a subscription.
export async function customerHasPaidPlan(
  _customerId: string,
  _opts: { retryDenied?: boolean } = {},
) {
  return true;
}

export async function customerHasManagedAccess(_customerId: string) {
  return true;
}

// OpenSEO usage credits are disabled for personal use; DataForSEO bills the
// configured API key directly. These helpers stay as no-ops so callers keep
// compiling without Autumn round-trips.
export async function checkUsageCreditsDepleted(
  _customer: BillingCustomerContext,
): Promise<{ depleted: boolean; monthlyRemaining: number }> {
  return { depleted: false, monthlyRemaining: Number.POSITIVE_INFINITY };
}

/**
 * Previously threw INSUFFICIENT_CREDITS when the org had no Autumn credits.
 * Always allows spend for personal deployments.
 */
export async function assertUsageCreditsAvailable(
  _customerId: string,
): Promise<{ monthlyRemaining: number }> {
  return { monthlyRemaining: Number.POSITIVE_INFINITY };
}

/**
 * Previously deducted marked-up spend from Autumn usage/topup pools.
 * No-op: personal deployments pay DataForSEO directly.
 */
export async function trackUsageCreditSpend(_args: {
  customer: BillingCustomerContext;
  customerId: string;
  creditFeature: CreditFeature;
  costUsd: number;
  monthlyRemaining: number;
  properties?: Record<string, unknown>;
}): Promise<void> {
  return;
}
