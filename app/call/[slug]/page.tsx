import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CallScreen } from "@/components/call/call-screen";
import { loadBusiness } from "@/lib/agent/business";

const SLUG = /^[a-z0-9-]{1,80}$/;

export async function generateMetadata(props: PageProps<"/call/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const bundle = SLUG.test(slug) ? await loadBusiness(slug) : null;
  return { title: bundle ? `Call ${bundle.business.name}` : "Call" };
}

export default async function CallPage(props: PageProps<"/call/[slug]">) {
  const { slug } = await props.params;
  if (!SLUG.test(slug)) notFound();
  const bundle = await loadBusiness(slug);
  if (!bundle) notFound();
  const { business } = bundle;
  return (
    <CallScreen
      slug={business.slug}
      agentName={business.persona.agentName}
      businessName={business.name}
      languages={business.profile.languages}
    />
  );
}
