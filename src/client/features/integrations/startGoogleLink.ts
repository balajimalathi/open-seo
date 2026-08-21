import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { authClient } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  startGa4GrantRelease,
  startSelfHostedGa4Link,
} from "@/serverFunctions/ga4";
import {
  startGscGrantRelease,
  startSelfHostedGscLink,
} from "@/serverFunctions/gsc";
import { GA4_OAUTH_PROVIDER_ID } from "@/shared/ga4";
import { GSC_OAUTH_PROVIDER_ID } from "@/shared/gsc";

const googleProviders = {
  gsc: {
    providerId: GSC_OAUTH_PROVIDER_ID,
    startSelfHosted: startSelfHostedGscLink,
    startRelease: startGscGrantRelease,
  },
  ga4: {
    providerId: GA4_OAUTH_PROVIDER_ID,
    startSelfHosted: startSelfHostedGa4Link,
    startRelease: startGa4GrantRelease,
  },
} as const;

/**
 * Kick off an incremental Google OAuth grant. On success this redirects the
 * whole page to Google's consent screen; `callbackURL` is where Google returns
 * the user afterward. Shared by the connection cards, onboarding, property
 * pickers, and re-engagement prompt so the link/error/redirect flow stays in
 * one place — callers keep their own analytics and dismissal behavior.
 */
export async function startGoogleLink(
  provider: "gsc" | "ga4",
  callbackURL: string,
): Promise<void> {
  try {
    const config = googleProviders[provider];
    if (!isHostedClientAuthMode()) {
      const res = await config.startSelfHosted({ data: { callbackURL } });
      window.location.href = res.url;
      return;
    }

    const res = await authClient.oauth2.link({
      providerId: config.providerId,
      callbackURL,
      errorCallbackURL: callbackURL,
    });
    if (res.error) {
      toast.error(res.error.message ?? "Could not start Google sign-in");
      return;
    }
    if (res.data?.url) window.location.href = res.data.url;
  } catch (error) {
    toast.error(getStandardErrorMessage(error));
  }
}

/** Prove Google identity and release any OpenSEO grant for that Google account. */
export async function startGoogleGrantRelease(
  provider: "gsc" | "ga4",
  callbackURL: string,
): Promise<void> {
  try {
    const res = await googleProviders[provider].startRelease({
      data: { callbackURL },
    });
    window.location.href = res.url;
  } catch (error) {
    toast.error(getStandardErrorMessage(error));
  }
}
