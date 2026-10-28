import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import type {
  BusinessProfile,
  ConversationSummary,
  EvalCheck,
  EvalTurn,
  MessageMeta,
  Persona,
} from "@/lib/contracts";

export const EMBEDDING_DIMENSIONS = 768;

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const businessId = () =>
  uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" });

export const businesses = pgTable("businesses", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["clinic", "generic"] }).notNull(),
  website: text("website"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  profile: jsonb("profile").$type<BusinessProfile>().notNull(),
  persona: jsonb("persona").$type<Persona>().notNull(),
  onboardMs: integer("onboard_ms"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: id(),
    businessId: businessId(),
    sourceUrl: text("source_url"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(title,'') || ' ' || content)`,
    ),
    createdAt: createdAt(),
  },
  (t) => [
    index("kb_chunks_business_idx").on(t.businessId),
    index("kb_chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("kb_chunks_tsv_idx").using("gin", t.tsv),
  ],
);

export const locations = pgTable("locations", {
  id: id(),
  businessId: businessId(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  phone: text("phone"),
});

export const staff = pgTable("staff", {
  id: id(),
  businessId: businessId(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  specialties: text("specialties").array().notNull().default(sql`'{}'::text[]`),
  languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
});

export const services = pgTable("services", {
  id: id(),
  businessId: businessId(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  durationMin: integer("duration_min").notNull(),
  priceInr: integer("price_inr"),
  priceNote: text("price_note"),
  description: text("description").notNull(),
  /** Staff titles or specialty tags allowed to perform this service. Empty means anyone. */
  specialty: text("specialty"),
});

export const slots = pgTable(
  "slots",
  {
    id: id(),
    businessId: businessId(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["open", "booked", "blocked"] })
      .notNull()
      .default("open"),
  },
  (t) => [
    uniqueIndex("slots_staff_start_uq").on(t.staffId, t.startsAt),
    index("slots_lookup_idx").on(t.businessId, t.status, t.startsAt),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    businessId: businessId(),
    name: text("name"),
    phone: text("phone"),
    email: text("email"),
    language: text("language"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("customers_phone_uq").on(t.businessId, t.phone),
    uniqueIndex("customers_email_uq").on(t.businessId, t.email),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    businessId: businessId(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    channel: text("channel", { enum: ["voice", "chat"] }).notNull(),
    status: text("status", {
      enum: ["active", "escalated", "human", "resolved", "abandoned"],
    })
      .notNull()
      .default("active"),
    stage: text("stage").notNull().default("greeting"),
    language: text("language").notNull().default("en"),
    intent: text("intent"),
    sentiment: real("sentiment").notNull().default(0),
    summary: jsonb("summary").$type<ConversationSummary>(),
    resolvedByAi: boolean("resolved_by_ai"),
    isEval: boolean("is_eval").notNull().default(false),
    startedAt: createdAt(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("conversations_business_idx").on(t.businessId, t.lastActivityAt)],
);

const conversationId = () =>
  uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" });

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: conversationId().notNull(),
    role: text("role", { enum: ["customer", "agent", "human", "system"] }).notNull(),
    content: text("content").notNull(),
    meta: jsonb("meta").$type<MessageMeta>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const toolCalls = pgTable("tool_calls", {
  id: id(),
  conversationId: conversationId().notNull(),
  name: text("name").notNull(),
  input: jsonb("input").$type<unknown>().notNull(),
  output: jsonb("output").$type<unknown>(),
  ok: boolean("ok").notNull(),
  durationMs: integer("duration_ms").notNull(),
  createdAt: createdAt(),
});

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    businessId: businessId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => slots.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    conversationId: conversationId(),
    status: text("status", { enum: ["confirmed", "cancelled", "rescheduled", "completed"] })
      .notNull()
      .default("confirmed"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    priceInr: integer("price_inr"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    // The database itself refuses a second live booking on the same slot.
    uniqueIndex("appointments_live_slot_uq")
      .on(t.slotId)
      .where(sql`status = 'confirmed'`),
  ],
);

export const tickets = pgTable("tickets", {
  id: id(),
  businessId: businessId(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  conversationId: conversationId(),
  category: text("category").notNull(),
  priority: text("priority", { enum: ["low", "medium", "high", "urgent"] }).notNull(),
  summary: text("summary").notNull(),
  status: text("status", { enum: ["open", "pending", "resolved"] }).notNull().default("open"),
  createdAt: createdAt(),
});

export const leads = pgTable("leads", {
  id: id(),
  businessId: businessId(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  conversationId: conversationId(),
  interest: text("interest").notNull(),
  budget: text("budget"),
  timeline: text("timeline"),
  score: integer("score").notNull(),
  status: text("status", { enum: ["new", "contacted", "qualified", "won", "lost"] })
    .notNull()
    .default("new"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const escalations = pgTable("escalations", {
  id: id(),
  businessId: businessId(),
  conversationId: conversationId().notNull(),
  reason: text("reason").notNull(),
  trigger: text("trigger").notNull(),
  urgency: text("urgency", { enum: ["low", "medium", "high", "critical"] }).notNull(),
  summary: text("summary").notNull(),
  status: text("status", { enum: ["open", "claimed", "resolved"] }).notNull().default("open"),
  claimedBy: text("claimed_by"),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const followUps = pgTable(
  "follow_ups",
  {
    id: id(),
    businessId: businessId(),
    conversationId: conversationId(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["reminder", "recovery", "callback", "post_visit", "lead_nurture"] })
      .notNull(),
    channel: text("channel", { enum: ["email", "whatsapp", "call"] }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["pending", "sent", "failed", "cancelled"] })
      .notNull()
      .default("pending"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("follow_ups_due_idx").on(t.status, t.dueAt)],
);

export const notifications = pgTable("notifications", {
  id: id(),
  businessId: businessId(),
  conversationId: conversationId(),
  channel: text("channel", { enum: ["email", "whatsapp"] }).notNull(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  status: text("status", { enum: ["sent", "failed", "skipped"] }).notNull(),
  providerId: text("provider_id"),
  error: text("error"),
  createdAt: createdAt(),
});

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    businessId: uuid("business_id"),
    conversationId: uuid("conversation_id"),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("events_business_idx").on(t.businessId, t.id)],
);

export const evalRuns = pgTable("eval_runs", {
  id: id(),
  status: text("status", { enum: ["running", "done", "failed"] }).notNull(),
  total: integer("total").notNull(),
  passed: integer("passed").notNull().default(0),
  completed: integer("completed").notNull().default(0),
  avgLatencyMs: integer("avg_latency_ms"),
  startedAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const evalResults = pgTable("eval_results", {
  id: id(),
  runId: uuid("run_id")
    .notNull()
    .references(() => evalRuns.id, { onDelete: "cascade" }),
  scenarioId: text("scenario_id").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  passed: boolean("passed").notNull(),
  checks: jsonb("checks").$type<EvalCheck[]>().notNull(),
  transcript: jsonb("transcript").$type<EvalTurn[]>().notNull(),
  judgeNotes: text("judge_notes"),
  avgLatencyMs: integer("avg_latency_ms"),
  conversationId: uuid("conversation_id"),
  createdAt: createdAt(),
});
