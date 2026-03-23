import { Router } from "express";

const router = Router();

const NEXAR_CLIENT_ID = process.env.NEXAR_CLIENT_ID!;
const NEXAR_CLIENT_SECRET = process.env.NEXAR_CLIENT_SECRET!;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12시간

interface CacheEntry {
  data: unknown;
  cachedAt: number;
}

const searchCache = new Map<string, CacheEntry>();

async function getNexarToken(): Promise<string> {
  const response = await fetch("https://identity.nexar.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: NEXAR_CLIENT_ID,
      client_secret: NEXAR_CLIENT_SECRET,
    }).toString(),
  });
  if (!response.ok) throw new Error("Nexar 토큰 발급 실패");
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

const NEXAR_QUERY = `
query Search($q: String!) {
  supSearch(q: $q) {
    results {
      part {
        mpn
        sellers {
          company { name }
          offers {
            clickUrl
            sku
            inventoryLevel
            moq
            packaging
            prices { price quantity }
          }
        }
      }
    }
  }
}
`;

router.post("/parts/search", async (req, res) => {
  const { part_number } = req.body as { part_number?: string };
  if (!part_number) {
    return res.status(400).json({ status: "error", message: "부품 번호를 입력해주세요." });
  }

  const cacheKey = part_number.trim().toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    console.log(`[캐시 HIT] ${part_number} (${Math.round((Date.now() - cached.cachedAt) / 60000)}분 전 캐시)`);
    return res.json({ status: "success", data: cached.data, cached: true });
  }

  try {
    console.log(`[API 호출] ${part_number}`);
    const token = await getNexarToken();
    const response = await fetch("https://api.nexar.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: NEXAR_QUERY, variables: { q: part_number } }),
    });
    if (!response.ok) throw new Error(`Nexar API 오류: ${response.status}`);
    const data = await response.json();

    searchCache.set(cacheKey, { data, cachedAt: Date.now() });
    return res.json({ status: "success", data, cached: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return res.status(500).json({ status: "error", message });
  }
});

export default router;
