import { redirect } from "next/navigation";
import { MetalDesk } from "@/components/MetalDesk";
import { METALS_DESKS_ENABLED } from "@/lib/flags";

export default function GoldPage() {
  if (!METALS_DESKS_ENABLED) redirect("/");
  return <MetalDesk code="gold" />;
}
