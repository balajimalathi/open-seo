import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { fetchUserData } from "@/server/lib/dataforseo/appendix";
import { AppError } from "@/server/lib/errors";
import {
  mapDataforseoAccountUsage,
  notConfiguredDataforseoAccountUsage,
  type DataforseoAccountUsageDto,
} from "@/shared/dataforseo-account-usage";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export const getDataforseoAccountUsage = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async (): Promise<DataforseoAccountUsageDto> => {
    if (!env.DATAFORSEO_API_KEY?.trim()) {
      return notConfiguredDataforseoAccountUsage();
    }

    const account = await fetchUserData();
    if (!account) {
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "DataForSEO returned no account data. Check the API key.",
      );
    }

    return mapDataforseoAccountUsage(account);
  });
