import type { Metadata } from "next";
import { OnboardStudio } from "@/components/onboard/onboard-studio";

export const metadata: Metadata = {
  title: "Onboard a business",
  description: "Turn any business website into a live voice and chat agent in under a minute.",
};

export default function OnboardPage() {
  return <OnboardStudio />;
}
