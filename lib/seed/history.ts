import type { ConversationSummary, Language } from "@/lib/contracts";

/**
 * Realistic past conversations so the console is alive from minute one.
 * These are clearly seeded history (see README); every live conversation is real.
 */
export type HistoryTemplate = {
  channel: "voice" | "chat";
  language: Language;
  intent: string;
  sentiment: number;
  outcome: ConversationSummary["outcome"];
  service?: string;
  ticket?: { category: string; priority: "low" | "medium" | "high" | "urgent"; summary: string };
  lead?: { interest: string; budget?: string; timeline?: string; score: number };
  escalation?: { reason: string; trigger: string; urgency: "low" | "medium" | "high" | "critical"; open?: boolean };
  turns: Array<[role: "customer" | "agent", text: string]>;
  summary: ConversationSummary;
  tools: string[];
};

export const seedCustomers = [
  { name: "Aditi Sharma", phone: "9826012345", email: "aditi.sharma@example.com", language: "en" },
  { name: "Rahul Verma", phone: "9893045678", email: "rahul.verma@example.com", language: "hinglish" },
  { name: "Sneha Patel", phone: "9752098765", email: "sneha.p@example.com", language: "en" },
  { name: "Imran Khan", phone: "9425011223", email: "imran.k@example.com", language: "hinglish" },
  { name: "Pooja Agrawal", phone: "9301122334", email: "pooja.agrawal@example.com", language: "hi" },
  { name: "Karan Malhotra", phone: "9179033445", email: "karan.m@example.com", language: "en" },
  { name: "Meera Iyer", phone: "9009044556", email: "meera.iyer@example.com", language: "en" },
  { name: "Vivek Choudhary", phone: "9617055667", email: null, language: "hinglish" },
  { name: "Ritu Jain", phone: "9826566778", email: "ritu.jain@example.com", language: "hi" },
  { name: "Arjun Nair", phone: "9893177889", email: "arjun.nair@example.com", language: "en" },
  { name: "Nisha Dubey", phone: "9754288990", email: "nisha.d@example.com", language: "hinglish" },
  { name: "Sameer Gupta", phone: "9425399001", email: "sameer.g@example.com", language: "en" },
  { name: "Ayesha Qureshi", phone: "9302400112", email: "ayesha.q@example.com", language: "hinglish" },
  { name: "Deepak Yadav", phone: "9179511223", email: null, language: "hi" },
] as const;

export const historyTemplates: HistoryTemplate[] = [
  {
    channel: "voice",
    language: "hinglish",
    intent: "book",
    sentiment: 0.5,
    outcome: "booked",
    service: "Teeth cleaning and polishing",
    tools: ["search_knowledge", "check_availability", "lookup_customer", "book_appointment"],
    turns: [
      ["customer", "Hello, teeth cleaning ka kitna charge hai aur kal ka slot milega?"],
      ["agent", "Teeth cleaning bara sau rupaye ki hai. Kal Dr. Mehta ke paas shaam 5 baje aur 6 baje khaali hai, Vijay Nagar mein."],
      ["customer", "5 baje theek hai."],
      ["agent", "Done. Kal shaam 5 baje Dr. Mehta ke saath booking confirm hai, email bhi bhej diya hai."],
    ],
    summary: { headline: "Booked teeth cleaning with Dr. Mehta", bullets: ["Asked price and next day slot in Hinglish", "Booked 5 PM, confirmation email sent"], outcome: "booked", nextStep: "None" },
  },
  {
    channel: "chat",
    language: "en",
    intent: "faq",
    sentiment: 0.3,
    outcome: "answered",
    tools: ["search_knowledge"],
    turns: [
      ["customer", "Do you accept Star Health insurance for root canal?"],
      ["agent", "We are cashless with Star Health for accidental dental injury only. For a regular root canal we give an itemised bill you can claim for reimbursement."],
      ["customer", "Got it, thanks."],
    ],
    summary: { headline: "Insurance question on root canal", bullets: ["Explained Star Health cashless covers accidental injury only", "Customer satisfied"], outcome: "answered", nextStep: "None" },
  },
  {
    channel: "chat",
    language: "en",
    intent: "billing",
    sentiment: -0.6,
    outcome: "escalated",
    ticket: { category: "billing", priority: "high", summary: "Charged 3,500 for laser on full face but package price quoted was 15 percent off. Wants difference refunded." },
    escalation: { reason: "Billing dispute on laser package price", trigger: "billing_dispute", urgency: "high" },
    tools: ["lookup_customer", "search_knowledge", "create_ticket", "escalate_to_human"],
    turns: [
      ["customer", "I was charged full price for my laser session even though I bought the 6 session package. This is the second time."],
      ["agent", "That should not happen twice. I have opened a billing ticket and our billing coordinator has the details, they will call you today."],
    ],
    summary: { headline: "Laser package billing dispute", bullets: ["Charged full session price despite 6 session package", "Second occurrence, customer upset", "Ticket opened, billing desk to call back"], outcome: "escalated", nextStep: "Billing desk to verify package and refund difference" },
  },
  {
    channel: "voice",
    language: "en",
    intent: "reschedule",
    sentiment: 0.2,
    outcome: "booked",
    service: "Dermatology consultation",
    tools: ["lookup_customer", "check_availability", "reschedule_appointment"],
    turns: [
      ["customer", "Hi, I need to move my skin appointment with Dr. Siddiqui to Saturday."],
      ["agent", "Sure. Saturday Dr. Siddiqui has 11:30 AM or 4 PM at Palasia. Which works?"],
      ["customer", "4 PM please."],
      ["agent", "Moved to Saturday at 4 PM with Dr. Siddiqui. Updated invite is in your inbox."],
    ],
    summary: { headline: "Rescheduled dermatology consult to Saturday", bullets: ["Moved to Saturday 4 PM, Palasia", "Updated calendar invite sent"], outcome: "booked", nextStep: "None" },
  },
  {
    channel: "chat",
    language: "hinglish",
    intent: "lead",
    sentiment: 0.4,
    outcome: "lead",
    lead: { interest: "Clear aligners for crooked front teeth", budget: "around 1.2 lakh", timeline: "next month", score: 75 },
    tools: ["search_knowledge", "capture_lead"],
    turns: [
      ["customer", "Aligners ka kya rate hai? Abhi book nahi karna, next month sochenge."],
      ["agent", "Clear aligners 1,20,000 se start hote hain, aur 6 ya 12 mahine ki no cost EMI available hai. Main aapka interest note kar leti hoon, Dr. Joshi ki team aapko call karegi."],
    ],
    summary: { headline: "Aligner enquiry, starting next month", bullets: ["Asked aligner price and EMI", "Lead captured, budget around 1.2 lakh"], outcome: "lead", nextStep: "Orthodontics team to call next week" },
  },
  {
    channel: "voice",
    language: "en",
    intent: "emergency",
    sentiment: -0.4,
    outcome: "escalated",
    escalation: { reason: "Facial swelling after extraction, possible infection", trigger: "emergency", urgency: "critical" },
    tools: ["escalate_to_human"],
    turns: [
      ["customer", "My father had a tooth removed yesterday and now his cheek is very swollen and he has fever."],
      ["agent", "If the swelling is affecting his breathing or swallowing, please call 108 or go to the nearest emergency now. I have alerted our on duty coordinator, who is calling you right away."],
    ],
    summary: { headline: "Post extraction swelling with fever", bullets: ["Father had extraction yesterday", "Swelling and fever reported", "Advised emergency care, coordinator alerted"], outcome: "escalated", nextStep: "Dr. Rathore's assistant to call immediately" },
  },
  {
    channel: "chat",
    language: "en",
    intent: "book",
    sentiment: 0.6,
    outcome: "booked",
    service: "HydraFacial",
    tools: ["search_knowledge", "check_availability", "book_appointment"],
    turns: [
      ["customer", "Can I get a HydraFacial this Sunday?"],
      ["agent", "Yes, Dr. Kulkarni has Sunday at 12:30 PM or 1:30 PM at Vijay Nagar. It is 4,000 rupees with no downtime."],
      ["customer", "12:30 please, name Sneha, 9752098765."],
      ["agent", "Booked for Sunday 12:30 PM with Dr. Kulkarni. Confirmation sent to your email."],
    ],
    summary: { headline: "Booked Sunday HydraFacial", bullets: ["Sunday 12:30 PM with Dr. Kulkarni", "Confirmation sent"], outcome: "booked", nextStep: "None" },
  },
  {
    channel: "chat",
    language: "hi",
    intent: "faq",
    sentiment: 0.2,
    outcome: "answered",
    tools: ["search_knowledge"],
    turns: [
      ["customer", "रविवार को क्लिनिक खुला रहता है क्या?"],
      ["agent", "रविवार को सिर्फ विजय नगर ब्रांच दोपहर 12 से 3 बजे तक खुली रहती है, कॉस्मेटोलॉजी अपॉइंटमेंट के लिए।"],
    ],
    summary: { headline: "Asked Sunday opening hours", bullets: ["Answered in Hindi: Vijay Nagar 12 to 3 PM, cosmetology only"], outcome: "answered", nextStep: "None" },
  },
  {
    channel: "voice",
    language: "hinglish",
    intent: "cancel",
    sentiment: 0,
    outcome: "booked",
    service: "Braces and aligners consultation",
    tools: ["lookup_customer", "cancel_appointment"],
    turns: [
      ["customer", "Mera kal ka Dr. Joshi wala appointment cancel karna hai."],
      ["agent", "Kal 11 baje Dr. Joshi ke saath braces consultation hai. Cancel kar doon?"],
      ["customer", "Haan."],
      ["agent", "Cancel ho gaya, koi charge nahi lagega. Jab chahein dobara book kar sakte hain."],
    ],
    summary: { headline: "Cancelled orthodontic consult", bullets: ["Cancelled more than 4 hours ahead, no fee"], outcome: "booked", nextStep: "None" },
  },
  {
    channel: "chat",
    language: "en",
    intent: "complaint",
    sentiment: -0.5,
    outcome: "ticket",
    ticket: { category: "complaint", priority: "medium", summary: "Waited 45 minutes past appointment time at Palasia on Tuesday. Wants waiting times improved." },
    tools: ["lookup_customer", "create_ticket"],
    turns: [
      ["customer", "I waited 45 minutes past my appointment time on Tuesday. Not acceptable."],
      ["agent", "Forty five minutes is too long, and I am sorry. I have logged this for the Palasia clinic manager, who will reply within a day."],
    ],
    summary: { headline: "Complaint about long wait at Palasia", bullets: ["Waited 45 minutes on Tuesday", "Ticket opened for clinic manager"], outcome: "ticket", nextStep: "Palasia manager to respond" },
  },
  {
    channel: "voice",
    language: "en",
    intent: "faq",
    sentiment: 0.1,
    outcome: "unresolved",
    tools: ["search_knowledge"],
    turns: [
      ["customer", "Do you do orthognathic jaw surgery?"],
      ["agent", "I do not have that information. I can have our surgery coordinator call you back today."],
    ],
    summary: { headline: "Asked about jaw surgery, not in knowledge base", bullets: ["Agent did not guess", "Callback offered"], outcome: "unresolved", nextStep: "Surgery coordinator to call back" },
  },
  {
    channel: "chat",
    language: "hinglish",
    intent: "book",
    sentiment: 0.4,
    outcome: "booked",
    service: "Laser hair reduction",
    tools: ["search_knowledge", "check_availability", "book_appointment"],
    turns: [
      ["customer", "Upper lip laser ka session book karna hai Friday shaam ko."],
      ["agent", "Upper lip laser 2,500 per session hai. Friday Dr. Kulkarni ke paas 5:30 aur 7 baje slot hai."],
      ["customer", "5:30 kar do."],
      ["agent", "Friday 5:30 PM book ho gaya. Ek din pehle shave kar lijiye, waxing mat kijiye."],
    ],
    summary: { headline: "Booked laser session Friday evening", bullets: ["Upper lip laser with Dr. Kulkarni", "Pre care instructions shared"], outcome: "booked", nextStep: "None" },
  },
];
