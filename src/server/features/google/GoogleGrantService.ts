import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { GscConnectionRepository } from "@/server/features/gsc/repositories/GscConnectionRepository";
import { AppError } from "@/server/lib/errors";
import { GA4_OAUTH_PROVIDER_ID } from "@/shared/ga4";
import { GSC_OAUTH_PROVIDER_ID } from "@/shared/gsc";

type GoogleOAuthProviderId =
  | typeof GSC_OAUTH_PROVIDER_ID
  | typeof GA4_OAUTH_PROVIDER_ID;

type GoogleGrant = {
  accountId: string;
  email: string | null;
};

function isGoogleOAuthProvider(
  providerId: string,
): providerId is GoogleOAuthProviderId {
  return (
    providerId === GSC_OAUTH_PROVIDER_ID || providerId === GA4_OAUTH_PROVIDER_ID
  );
}

async function listGrants(
  userId: string,
  providerId: GoogleOAuthProviderId,
): Promise<GoogleGrant[]> {
  const rows = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, providerId)));
  return rows.map((row) => ({ accountId: row.accountId, email: null }));
}

async function findOwnGrant(
  userId: string,
  providerId: GoogleOAuthProviderId,
  googleAccountId: string,
) {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, providerId),
        eq(account.accountId, googleAccountId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function deleteOwnConnections(
  userId: string,
  providerId: GoogleOAuthProviderId,
  googleAccountId: string,
) {
  if (providerId === GSC_OAUTH_PROVIDER_ID) {
    await GscConnectionRepository.deleteByConnectorAccount(
      userId,
      googleAccountId,
    );
    return;
  }
  await Ga4ConnectionRepository.deleteByConnectorAccount(
    userId,
    googleAccountId,
  );
}

async function deleteAllConnections(
  providerId: GoogleOAuthProviderId,
  googleAccountId: string,
) {
  if (providerId === GSC_OAUTH_PROVIDER_ID) {
    await GscConnectionRepository.deleteByGoogleAccountId(googleAccountId);
    return;
  }
  await Ga4ConnectionRepository.deleteByGoogleAccountId(googleAccountId);
}

async function disconnectOwnGrant(input: {
  userId: string;
  providerId: string;
  googleAccountId: string;
}): Promise<void> {
  if (!isGoogleOAuthProvider(input.providerId)) {
    throw new AppError("VALIDATION_ERROR", "Unknown Google integration.");
  }
  const grant = await findOwnGrant(
    input.userId,
    input.providerId,
    input.googleAccountId,
  );
  if (!grant) {
    throw new AppError(
      "NOT_FOUND",
      "That Google account isn't connected to your OpenSEO account.",
    );
  }
  await deleteOwnConnections(
    input.userId,
    input.providerId,
    input.googleAccountId,
  );
  await db
    .delete(account)
    .where(
      and(
        eq(account.userId, input.userId),
        eq(account.providerId, input.providerId),
        eq(account.accountId, input.googleAccountId),
      ),
    );
}

async function disconnectAllOwnGrants(
  userId: string,
  providerId: string,
): Promise<void> {
  if (!isGoogleOAuthProvider(providerId)) {
    throw new AppError("VALIDATION_ERROR", "Unknown Google integration.");
  }
  const grants = await listGrants(userId, providerId);
  for (const grant of grants) {
    await disconnectOwnGrant({
      userId,
      providerId,
      googleAccountId: grant.accountId,
    });
  }
}

/** Deletes every OpenSEO grant (and project mapping) for this Google `sub`.
 *  Only call after the callback has verified an ID token for that `sub`. */
async function releaseGrantForGoogleAccount(input: {
  providerId: string;
  googleAccountId: string;
}): Promise<void> {
  if (!isGoogleOAuthProvider(input.providerId)) {
    throw new AppError("VALIDATION_ERROR", "Unknown Google integration.");
  }
  await deleteAllConnections(input.providerId, input.googleAccountId);
  await db
    .delete(account)
    .where(
      and(
        eq(account.providerId, input.providerId),
        eq(account.accountId, input.googleAccountId),
      ),
    );
}

export const GoogleGrantService = {
  listGrants,
  disconnectOwnGrant,
  disconnectAllOwnGrants,
  releaseGrantForGoogleAccount,
};
