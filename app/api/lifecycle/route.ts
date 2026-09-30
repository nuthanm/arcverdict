import { assembleForwardBook } from "@/lib/forward-book";
import { refreshLifecycleBook } from "@/lib/lifecycle-book";
import { lifecycleBook, lifecycleDaily, lifecycleHistory } from "@/lib/lifecycle";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    await refreshLifecycleBook();
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

    const history = lifecycleHistory();
    const book = await assembleForwardBook(history.daily, asOf);

    return Response.json({
      ok: true,
      asOf: book.asOf,
      universe: rows.length,
      closedThrough: book.closedThrough,
      marketOpen: book.marketOpen,
      awaitingClose: book.awaitingClose,
      freshFrom: book.freshFrom,
      leads: book.leads,
      monitoring: book.monitoring,
      historical: book.historical,
    });
  } catch (err) {
    console.error("lifecycle request failed", err);
    return Response.json({ ok: false, error: "Lifecycle book failed" }, { status: 500 });
  }
}
