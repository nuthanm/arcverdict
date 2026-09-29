import { lifecycleBook, lifecycleDaily, suggestionCounts } from "@/lib/lifecycle";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const company = new URL(request.url).searchParams.get("company");
  const rows = lifecycleBook();
  const asOf = rows.find((row) => row.date)?.date ?? null;

  if (company) {
    const row = rows.find((item) => item.company === company) ?? null;
    return Response.json({
      ok: true,
      company,
      row,
      daily: lifecycleDaily(company),
    });
  }

  return Response.json({
    ok: true,
    asOf,
    universe: rows.length,
    counts: suggestionCounts(rows),
    rows,
  });
}
