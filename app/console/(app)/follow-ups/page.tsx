import type { Metadata } from "next";
import { FollowUpsView } from "@/components/console/followups-view";

export const metadata: Metadata = { title: "Follow ups" };

export default function Page() {
  return <FollowUpsView />;
}
