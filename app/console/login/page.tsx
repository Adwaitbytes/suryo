import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/console/login-form";

export const metadata: Metadata = { title: "Operator sign in" };

export default function LoginPage() {
  if (!process.env.OPERATOR_KEY) redirect("/console");
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6">
      <LoginForm />
    </main>
  );
}
