import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";

const router: IRouter = Router();

const NEXAR_CLIENT_ID = "ef37c191-34f7-4b08-80da-99b8bff04cfc";
const NEXAR_CLIENT_SECRET = "n0L1mKSFSEaDHNnP-klrKaXk_uJq4Qgw4i7g";

function requireLogin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.username) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }
  next();
}

async function getNexarToken(): Promise<string> {
  const resp = await fetch("https://identity.nexar.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: NEXAR_CLIENT_ID,
      client_secret: NEXAR_CLIENT_SECRET,
    }),
  });
  if (!resp.ok) throw new Error(`Token request failed: ${resp.status}`);
  const data = (await resp.json()) as { access_token: string };
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
}`;

router.post("/api/parts/search", requireLogin, async (req: Request, res: Response) => {
  const { part_number } = req.body as { part_number?: string };
  if (!part_number?.trim()) {
    res.status(400).json({ status: "error", message: "부품명을 입력해주세요." });
    return;
  }

  try {
    const token = await getNexarToken();
    const resp = await fetch("https://api.nexar.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: NEXAR_QUERY, variables: { q: part_number.trim() } }),
    });

    if (!resp.ok) {
      res.status(502).json({ status: "error", message: `Nexar API 오류: ${resp.status}` });
      return;
    }

    const raw = (await resp.json()) as {
      data?: { supSearch?: { results?: unknown[] } };
    };

    // 재고 있는 항목만 필터링
    const results = raw?.data?.supSearch?.results ?? [];
    for (const result of results as Array<{
      part?: { sellers?: Array<{ offers?: Array<{ inventoryLevel?: number }> }> };
    }>) {
      if (!result.part) continue;
      const filtered = [];
      for (const seller of result.part.sellers ?? []) {
        const validOffers = (seller.offers ?? []).filter(
          (o) => (o.inventoryLevel ?? 0) > 0
        );
        if (validOffers.length > 0) {
          seller.offers = validOffers;
          filtered.push(seller);
        }
      }
      result.part.sellers = filtered;
    }

    res.json({ status: "success", data: raw });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    res.status(500).json({ status: "error", message: msg });
  }
});

export default router;
