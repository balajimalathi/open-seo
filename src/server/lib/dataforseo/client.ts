import {
  type CreditFeature,
  mapDataforseoPathToCreditFeature,
} from "@/shared/billing-credit-features";
import type { BillingCustomerContext } from "@/server/billing/subscription";
// Type-only namespace import: erased at compile, so the section modules (and
// the SDK they pull in) still only load through loadDataforseoSections below.
import type * as sections from "@/server/lib/dataforseo/sections";
import {
  DataforseoChargedTaskError,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";

export { mapDataforseoPathToCreditFeature };

/** The section-fetcher barrel (sections.ts), as a type for `meter` pickers. */
export type DataforseoSections = typeof sections;

let sectionsPromise: Promise<DataforseoSections> | undefined;

/** Single lazy boundary for the DataForSEO subtree: the section fetchers and
 * the ~3 MB dataforseo-client SDK they statically import stay out of the
 * eager isolate startup graph and load once, on the first API call. */
export function loadDataforseoSections(): Promise<DataforseoSections> {
  return (sectionsPromise ??= import("@/server/lib/dataforseo/sections"));
}

/**
 * Wraps a section fetcher with billing metering. Each entry on the client is
 * `meter(customer, (s) => s.fetchX, defaultFeature?)`, which returns a function
 * with the fetcher's own input type and resolves to its unwrapped `.data`. The
 * picker indirection (rather than the fetcher itself) keeps the section
 * modules behind loadDataforseoSections.
 *
 * `defaultFeature` is the fallback credit feature; a caller can override it per
 * call by passing `creditFeature` in the input (e.g. an MCP tool attributing
 * spend to its own feature). The extra field is ignored by the fetchers, which
 * read named fields rather than spreading the input.
 */
function meter<I, T>(
  customer: BillingCustomerContext,
  pick: (
    sections: DataforseoSections,
  ) => (input: I) => Promise<DataforseoApiResponse<T>>,
  defaultFeature?: CreditFeature,
): (input: I & { creditFeature?: CreditFeature }) => Promise<T> {
  return (input) =>
    meterDataforseoCall(
      customer,
      async () => pick(await loadDataforseoSections())(input),
      input.creditFeature ?? defaultFeature,
    );
}

export function createDataforseoClient(customer: BillingCustomerContext) {
  return {
    business: {
      businessListings: meter(
        customer,
        (s) => s.fetchBusinessListingsSearch,
        "local_seo",
      ),
      questionsAnswers: meter(
        customer,
        (s) => s.fetchQuestionsAnswers,
        "local_seo",
      ),
      myBusinessInfo: meter(
        customer,
        (s) => s.fetchMyBusinessInfo,
        "local_seo",
      ),
      // task_post is where DataForSEO charges; collection runs unmetered
      // through fetchBusinessDataTaskResult (see index.ts).
      reviewsTaskPost: meter(
        customer,
        (s) => s.postGoogleReviewsTask,
        "local_seo",
      ),
      updatesTaskPost: meter(
        customer,
        (s) => s.postMyBusinessUpdatesTask,
        "local_seo",
      ),
    },
    backlinks: {
      summary: meter(customer, (s) => s.fetchBacklinksSummary),
      rows: meter(customer, (s) => s.fetchBacklinksRows),
      referringDomains: meter(customer, (s) => s.fetchReferringDomains),
      domainPages: meter(customer, (s) => s.fetchDomainPagesSummary),
      history: meter(customer, (s) => s.fetchBacklinksHistory),
    },
    keywords: {
      related: meter(customer, (s) => s.fetchRelatedKeywords),
      suggestions: meter(customer, (s) => s.fetchKeywordSuggestions),
      ideas: meter(customer, (s) => s.fetchKeywordIdeas),
      // Google Ads endpoints for countries Labs doesn't support.
      adsIdeas: meter(customer, (s) => s.fetchAdsKeywordIdeas),
      adsSearchVolume: meter(customer, (s) => s.fetchAdsSearchVolume),
    },
    domain: {
      rankOverview: meter(customer, (s) => s.fetchDomainRankOverview),
      rankedKeywords: meter(customer, (s) => s.fetchRankedKeywords),
      relevantPages: meter(customer, (s) => s.fetchRelevantPages),
    },
    serp: {
      live: meter(customer, (s) => s.fetchLiveSerp),
      rankCheck: meter(customer, (s) => s.fetchRankCheckSerp, "rank_tracking"),
      // Posts up to 100 queued rank check tasks; one metered charge covers the
      // whole batch (DataForSEO bills task_post at post time, collection is
      // free).
      rankCheckTaskPost: meter(
        customer,
        (s) => s.postRankCheckTasks,
        "rank_tracking",
      ),
      local: meter(customer, (s) => s.fetchLocalSerp, "local_seo"),
    },
    labs: {
      // Callers (e.g. the keyword-metrics MCP tool) can attribute the spend to
      // their own feature by passing `creditFeature` in the input; defaults to
      // rank_tracking when omitted.
      keywordOverview: meter(
        customer,
        (s) => s.fetchKeywordOverview,
        "rank_tracking",
      ),
      serpCompetitors: meter(customer, (s) => s.fetchSerpCompetitors),
    },
    aiSearch: {
      mentionsSearch: meter(customer, (s) => s.fetchLlmMentionsSearch),
      aggregatedMetrics: meter(customer, (s) => s.fetchLlmAggregatedMetrics),
      topPages: meter(customer, (s) => s.fetchLlmTopPages),
      crossAggregatedMetrics: meter(
        customer,
        (s) => s.fetchLlmCrossAggregatedMetrics,
      ),
      llmResponse: meter(customer, (s) => s.fetchLlmResponse),
    },
  } as const;
}

async function meterDataforseoCall<T>(
  _customer: BillingCustomerContext,
  execute: () => Promise<DataforseoApiResponse<T>>,
  _creditFeature?: CreditFeature,
): Promise<T> {
  // Personal deployments do not meter through Autumn. DataForSEO bills the
  // configured API key directly. Still unwrap Invalid Field errors that
  // DataForSEO did not charge so callers get VALIDATION_ERROR.
  try {
    const result = await execute();
    return result.data;
  } catch (error) {
    if (
      error instanceof DataforseoChargedTaskError &&
      error.isInvalidField &&
      error.billing.costUsd <= 0
    ) {
      throw new AppError("VALIDATION_ERROR", error.message);
    }
    throw error;
  }
}
