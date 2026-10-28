/**
 * Client safe copy of the tool labels for the call screen. The canonical ACTION_LABELS live in
 * lib/agent/actions.ts, which imports the database and cannot ship to the browser.
 */
export const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "Checking clinic info",
  check_availability: "Checking availability",
  lookup_customer: "Finding your details",
  upsert_customer: "Saving your details",
  book_appointment: "Booking appointment",
  reschedule_appointment: "Rescheduling",
  cancel_appointment: "Cancelling appointment",
  create_ticket: "Opening a ticket",
  capture_lead: "Noting your interest",
  send_confirmation: "Sending confirmation",
  escalate_to_human: "Connecting a human",
  schedule_follow_up: "Scheduling a follow up",
};
