export type CaseListItem = {
  id: string;
  nameRu: string;
  nameEn: string;
  costType: "key" | "ton" | "tonyx";
  costValue: number;
  canOpen: boolean;
  have: number;
};

export type CasesListResponse = {
  cases: CaseListItem[];
  balances: { ton: number; tonyx: number };
  bossKeys: Record<number, number>;
  nftInventory: {
    fragments: Record<string, number>;
    assembled: string[];
  };
};

export type CaseOpenResponse = {
  rewards: Array<{
    type: "ton" | "tonyx" | "nft_fragment";
    amount?: number;
    nftId?: string;
  }>;
  balances: { ton: number; tonyx: number };
  bossKeys: Record<number, number>;
  nftInventory: {
    fragments: Record<string, number>;
    assembled: string[];
  };
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export const casesApi = {
  list: () => api<CasesListResponse>("/api/mini/cases/list"),
  open: (caseId: string) =>
    api<CaseOpenResponse>("/api/mini/cases/open", {
      method: "POST",
      body: JSON.stringify({ caseId }),
    }),
};
