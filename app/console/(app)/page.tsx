import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveView } from "@/components/console/live/live-view";

export const metadata: Metadata = { title: "Live" };

export default function LivePage() {
  return (
    <Suspense>
      <LiveView />
    </Suspense>
  );
}
