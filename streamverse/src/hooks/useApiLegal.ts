import { useQuery } from "@tanstack/react-query";
import { legalApi } from "@/api/legal.api";
import { DEMO_MODE } from "@/lib/config";
import type { LegalKey } from "@/lib/legal";

function fetchByKey(key: LegalKey) {
  if (key === "privacy-policy") return legalApi.getPrivacyPolicy();
  if (key === "terms-and-conditions") return legalApi.getTermsAndConditions();
  return legalApi.getRefundPolicy();
}

export function useApiLegalQuery(docKey: LegalKey) {
  return useQuery({
    queryKey: ["legal", docKey] as const,
    queryFn: async () => {
      const res = await fetchByKey(docKey);
      return res.data;
    },
    enabled: !DEMO_MODE,
    staleTime: 10 * 60 * 1000,
  });
}
