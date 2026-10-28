import type { Metadata } from "next";
import { connection } from "next/server";
import { EvalDashboard } from "@/components/evals/eval-dashboard";
import { scorecard } from "@/lib/evals/store";

export const metadata: Metadata = {
  title: "Evals",
  description: "Automated scenario evaluations of the Suryo agent, with every check and transcript.",
};

export default async function EvalsPage() {
  await connection();
  return <EvalDashboard initial={await scorecard()} />;
}
