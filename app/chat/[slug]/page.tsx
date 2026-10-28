import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { loadBusiness } from "@/lib/agent/business";

const SLUG = /^[a-z0-9-]{1,80}$/;

export async function generateMetadata(props: PageProps<"/chat/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const bundle = SLUG.test(slug) ? await loadBusiness(slug) : null;
  return { title: bundle ? `Chat with ${bundle.business.name}` : "Chat" };
}

export default async function ChatPage(props: PageProps<"/chat/[slug]">) {
  const { slug } = await props.params;
  const query = await props.searchParams;
  if (!SLUG.test(slug)) notFound();
  const bundle = await loadBusiness(slug);
  if (!bundle) notFound();
  const { business } = bundle;
  const c = typeof query.c === "string" ? query.c : null;
  return (
    <ChatView
      slug={business.slug}
      businessName={business.name}
      agentName={business.persona.agentName}
      embed={query.embed === "1"}
      initialConversationId={c}
    />
  );
}
