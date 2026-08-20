import type { ReactNode } from "react";

export type HostedPlanGateState = {
  isLoading: boolean;
  isFreePlan: boolean;
};

// Personal deployments have no plan tiers. Always unlock paid features.
const UNLOCKED_PLAN_GATE: HostedPlanGateState = {
  isLoading: false,
  isFreePlan: false,
};

export function HostedPlanGate({
  children,
}: {
  children: (state: HostedPlanGateState) => ReactNode;
}) {
  return children(UNLOCKED_PLAN_GATE);
}
