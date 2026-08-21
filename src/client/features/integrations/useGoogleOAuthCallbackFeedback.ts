import { useRouter, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { GOOGLE_ACCOUNT_ALREADY_LINKED_ERROR } from "@/shared/google-oauth";

type GoogleOAuthSearch = {
  error?: string;
  grantReleased?: string;
};

/**
 * Reads the Google OAuth callback query on any page that validates
 * `error` / `grantReleased`. Toasts a successful grant release and strips
 * that param so a refresh doesn't repeat the message.
 */
export function useGoogleOAuthCallbackFeedback() {
  const router = useRouter();
  const search = useSearch({ strict: false }) as GoogleOAuthSearch;
  const alreadyLinked = search.error === GOOGLE_ACCOUNT_ALREADY_LINKED_ERROR;
  const grantReleased = search.grantReleased === "1";

  useEffect(() => {
    if (!grantReleased) return;
    toast.success("Google grant disconnected. Connect again to finish setup.");
    const params = new URLSearchParams(router.state.location.searchStr);
    params.delete("grantReleased");
    const query = params.toString();
    router.history.replace(
      `${router.state.location.pathname}${query ? `?${query}` : ""}${router.state.location.hash}`,
    );
  }, [grantReleased, router]);

  return { alreadyLinked };
}
