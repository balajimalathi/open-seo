import { z } from "zod";

/** Better Auth generic-OAuth code when a Google `sub` is already stored on a
 *  different OpenSEO user. The connection UI reads this from `?error=`. */
export const GOOGLE_ACCOUNT_ALREADY_LINKED_ERROR =
  "account_already_linked_to_different_user";

export const googleOAuthCallbackSearchSchema = z.object({
  error: z.string().optional(),
  grantReleased: z.string().optional(),
});

export type GoogleOAuthCallbackSearch = z.infer<
  typeof googleOAuthCallbackSearchSchema
>;
