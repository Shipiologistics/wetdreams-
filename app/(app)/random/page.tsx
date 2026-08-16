import type { Metadata } from "next";
import { RandomMatch } from "@/components/random-match";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Random chat" };

export default async function RandomPage({ searchParams }: { searchParams: Promise<{ auto?: string }> }) {
  const viewer = await requireViewer();
  const params = await searchParams;
  return <RandomMatch userId={viewer.id} autoStart={params.auto === "1"} />;
}
