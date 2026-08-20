import type { LucideIcon } from "lucide-react";

type Props = {
  feature: string;
  description: string;
  bullets: Array<{ icon: LucideIcon; title: string; body: string }>;
};

/** Personal deployments have no paid-plan gate; kept as a no-op for call sites. */
export function AiSearchPaidPlanGate(_props: Props) {
  return null;
}
