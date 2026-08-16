import type { Metadata } from "next";
import { RandomMatch } from "@/components/random-match";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Random chat" };

export default async function RandomPage() {
  const viewer = await requireViewer();
  return <RandomMatch userId={viewer.id} />;
}
