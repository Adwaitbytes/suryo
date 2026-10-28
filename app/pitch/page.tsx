import type { Metadata } from "next";
import { getLiveSnapshot } from "@/components/marketing/live";
import { PitchDeck } from "@/components/marketing/pitch-deck";

export const metadata: Metadata = { title: "Pitch" };

export default async function PitchPage() {
  const live = await getLiveSnapshot();
  return <PitchDeck live={live} />;
}
