import { mcxSession, nseSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const market = new URL(request.url).searchParams.get("market");
  const session = market === "metals" ? mcxSession() : nseSession();
  return Response.json({ ok: true, session });
}
