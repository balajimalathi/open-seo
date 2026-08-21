/* eslint-disable max-lines -- signed state, token exchange, and callback stay together */
import { symmetricEncrypt } from "better-auth/crypto";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import { z } from "zod";
import { db } from "@/db";
import { account } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getAuthMode, isHostedAuthMode } from "@/lib/auth-mode";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { AppError } from "@/server/lib/errors";
import { responseForAppError } from "@/server/lib/http-errors";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { GA4_OAUTH_PROVIDER_ID, GA4_OAUTH_SCOPES } from "@/shared/ga4";
import { GOOGLE_ACCOUNT_ALREADY_LINKED_ERROR } from "@/shared/google-oauth";
import { GSC_OAUTH_PROVIDER_ID, GSC_OAUTH_SCOPES } from "@/shared/gsc";
import { GoogleGrantService } from "./GoogleGrantService";
import {
  getGoogleOAuthClientConfig,
  hasSelfHostedGoogleOAuthConfig,
} from "./oauth-config";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export type SelfHostedGoogleOAuthIntegration = {
  providerId: string;
  stateNamespace: string;
  displayName: string;
  callbackPath: `/${string}`;
  scopes: readonly string[];
};

type SelfHostedGoogleUser = {
  userId: string;
  userEmail: string;
};

export const GSC_INTEGRATION: SelfHostedGoogleOAuthIntegration = {
  providerId: GSC_OAUTH_PROVIDER_ID,
  // Preserve the state-signing namespace used by the original GSC flow so a
  // deployment does not invalidate an authorization already in progress.
  stateNamespace: "gsc",
  displayName: "Search Console",
  callbackPath: "/api/gsc/oauth/callback",
  scopes: GSC_OAUTH_SCOPES,
};

export const GA4_INTEGRATION: SelfHostedGoogleOAuthIntegration = {
  providerId: GA4_OAUTH_PROVIDER_ID,
  stateNamespace: "ga4",
  displayName: "Google Analytics",
  callbackPath: "/api/ga4/oauth/callback",
  scopes: GA4_OAUTH_SCOPES,
};

const oauthPurposeSchema = z.enum(["link", "release"]);

const oauthStateSchema = z.object({
  userId: z.string().min(1),
  callbackPath: z.string().min(1),
  exp: z.number().int(),
  // Omitted on in-flight consents started before purpose existed.
  purpose: oauthPurposeSchema.optional().default("link"),
});

const googleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
  token_type: z.string().optional(),
});

const googleIdTokenSchema = z.object({ sub: z.string().min(1) });
type GoogleTokenResponse = z.infer<typeof googleTokenResponseSchema>;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getStateKey(clientSecret: string, stateNamespace: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`openseo:${stateNamespace}:${clientSecret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signState(
  payload: string,
  clientSecret: string,
  stateNamespace: string,
) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getStateKey(clientSecret, stateNamespace),
    new TextEncoder().encode(payload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

function getSafeCallbackPath(callbackURL: string, publicOrigin: string) {
  try {
    const url = new URL(callbackURL, publicOrigin);
    if (url.origin !== publicOrigin) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function withCallbackQuery(
  callbackPath: string,
  params: Record<string, string>,
) {
  const url = new URL(callbackPath, "https://openseo.invalid");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function redirectToCallback(
  callbackPath: string,
  params?: Record<string, string>,
) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: params ? withCallbackQuery(callbackPath, params) : callbackPath,
    },
  });
}

async function createState(input: {
  integration: SelfHostedGoogleOAuthIntegration;
  clientSecret: string;
  userId: string;
  callbackURL: string;
  publicOrigin: string;
  purpose: z.infer<typeof oauthPurposeSchema>;
}) {
  const payload = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        userId: input.userId,
        callbackPath: getSafeCallbackPath(
          input.callbackURL,
          input.publicOrigin,
        ),
        exp: Date.now() + 10 * 60 * 1_000,
        purpose: input.purpose,
      }),
    ),
  );
  const signature = await signState(
    payload,
    input.clientSecret,
    input.integration.stateNamespace,
  );
  return `${payload}.${signature}`;
}

async function verifyState(input: {
  state: string;
  clientSecret: string;
  integration: SelfHostedGoogleOAuthIntegration;
}) {
  const [payload, signature] = input.state.split(".");
  if (!payload || !signature) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Invalid ${input.integration.displayName} state`,
    );
  }
  const ok = await crypto.subtle.verify(
    "HMAC",
    await getStateKey(input.clientSecret, input.integration.stateNamespace),
    base64UrlToBytes(signature),
    new TextEncoder().encode(payload),
  );
  if (!ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Invalid ${input.integration.displayName} state`,
    );
  }
  const parsed = oauthStateSchema.parse(
    JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))),
  );
  if (parsed.exp < Date.now()) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Expired ${input.integration.displayName} state`,
    );
  }
  return parsed;
}

function getRedirectUri(
  publicOrigin: string,
  integration: SelfHostedGoogleOAuthIntegration,
) {
  return `${publicOrigin}${integration.callbackPath}`;
}

function getGoogleAccountId(tokens: GoogleTokenResponse) {
  if (!tokens.id_token) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Google did not return an ID token.",
    );
  }
  return googleIdTokenSchema.parse(decodeJwt(tokens.id_token)).sub;
}

async function upsertGrant(input: {
  integration: SelfHostedGoogleOAuthIntegration;
  user: SelfHostedGoogleUser;
  tokens: GoogleTokenResponse;
}): Promise<"ok" | "already_linked"> {
  const ctx = await getAuth().$context;
  const encrypt = (value: string) =>
    ctx.options.account?.encryptOAuthTokens
      ? symmetricEncrypt({ key: ctx.secretConfig, data: value })
      : value;
  const googleAccountId = getGoogleAccountId(input.tokens);
  const existing = await db
    .select({
      id: account.id,
      userId: account.userId,
      refreshToken: account.refreshToken,
    })
    .from(account)
    .where(
      and(
        eq(account.providerId, input.integration.providerId),
        eq(account.accountId, googleAccountId),
      ),
    )
    .limit(1);
  if (existing[0] && existing[0].userId !== input.user.userId) {
    return "already_linked";
  }
  const accountValues = {
    accountId: googleAccountId,
    providerId: input.integration.providerId,
    userId: input.user.userId,
    accessToken: await encrypt(input.tokens.access_token),
    refreshToken: input.tokens.refresh_token
      ? await encrypt(input.tokens.refresh_token)
      : (existing[0]?.refreshToken ?? null),
    idToken: input.tokens.id_token
      ? await encrypt(input.tokens.id_token)
      : null,
    accessTokenExpiresAt: new Date(
      Date.now() + (input.tokens.expires_in ?? 3600) * 1_000,
    ),
    refreshTokenExpiresAt: null,
    scope: input.tokens.scope
      ? input.tokens.scope.trim().split(/\s+/).join(",")
      : input.integration.scopes.join(","),
    password: null,
  };
  if (existing[0]) {
    await db
      .update(account)
      .set({ ...accountValues, updatedAt: new Date() })
      .where(eq(account.id, existing[0].id));
    return "ok";
  }
  await db.insert(account).values({
    id: crypto.randomUUID(),
    ...accountValues,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return "ok";
}

async function exchangeCode(input: {
  integration: SelfHostedGoogleOAuthIntegration;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Google rejected the ${input.integration.displayName} authorization code.`,
    );
  }
  return googleTokenResponseSchema.parse(await response.json());
}

export async function createSelfHostedGoogleAuthorizationUrl(input: {
  integration: SelfHostedGoogleOAuthIntegration;
  user: SelfHostedGoogleUser;
  callbackURL: string;
  publicOrigin: string;
  purpose?: z.infer<typeof oauthPurposeSchema>;
}) {
  const config = await getGoogleOAuthClientConfig();
  if (!config || !(await hasSelfHostedGoogleOAuthConfig(config))) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      `${input.integration.displayName} is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and BETTER_AUTH_SECRET.`,
    );
  }
  const redirectUri = getRedirectUri(input.publicOrigin, input.integration);
  const state = await createState({
    integration: input.integration,
    clientSecret: config.clientSecret,
    userId: input.user.userId,
    callbackURL: input.callbackURL,
    publicOrigin: input.publicOrigin,
    purpose: input.purpose ?? "link",
  });
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.integration.scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function handleSelfHostedGoogleOAuthCallback(input: {
  integration: SelfHostedGoogleOAuthIntegration;
  request: Request;
  user: SelfHostedGoogleUser;
  publicOrigin: string;
  hosted?: boolean;
}) {
  const hosted = input.hosted ?? isHostedAuthMode(getAuthMode(env.AUTH_MODE));
  const config = await getGoogleOAuthClientConfig();
  if (!config) {
    return new Response(
      `Missing ${input.integration.displayName} OAuth configuration`,
      { status: 500 },
    );
  }
  const url = new URL(input.request.url);
  const stateParam = url.searchParams.get("state");
  if (!stateParam) {
    return new Response(
      `Missing ${input.integration.displayName} OAuth state`,
      {
        status: 400,
      },
    );
  }
  const state = await verifyState({
    state: stateParam,
    clientSecret: config.clientSecret,
    integration: input.integration,
  });
  if (hosted && state.purpose !== "release") {
    return new Response("Not found", { status: 404 });
  }
  if (state.userId !== input.user.userId) {
    return new Response(
      `${input.integration.displayName} OAuth user mismatch`,
      {
        status: 403,
      },
    );
  }
  if (url.searchParams.get("error")) {
    return redirectToCallback(state.callbackPath);
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return new Response(`Missing ${input.integration.displayName} OAuth code`, {
      status: 400,
    });
  }
  const tokens = await exchangeCode({
    integration: input.integration,
    code,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: getRedirectUri(input.publicOrigin, input.integration),
  });
  if (state.purpose === "release") {
    await GoogleGrantService.releaseGrantForGoogleAccount({
      providerId: input.integration.providerId,
      googleAccountId: getGoogleAccountId(tokens),
    });
    return redirectToCallback(state.callbackPath, { grantReleased: "1" });
  }
  const result = await upsertGrant({
    integration: input.integration,
    user: input.user,
    tokens,
  });
  if (result === "already_linked") {
    return redirectToCallback(state.callbackPath, {
      error: GOOGLE_ACCOUNT_ALREADY_LINKED_ERROR,
    });
  }
  return redirectToCallback(state.callbackPath);
}

export async function handleSelfHostedGoogleOAuthCallbackRequest(
  request: Request,
  integration: SelfHostedGoogleOAuthIntegration,
) {
  try {
    const hosted = isHostedAuthMode(getAuthMode(env.AUTH_MODE));
    const context = await resolveUserContextFromHeaders(request.headers);
    return await handleSelfHostedGoogleOAuthCallback({
      integration,
      request,
      user: {
        userId: context.userId,
        userEmail: context.userEmail,
      },
      publicOrigin: getPublicOrigin(request),
      hosted,
    });
  } catch (error) {
    return responseForAppError(
      error,
      `${integration.displayName} OAuth failed`,
    );
  }
}
