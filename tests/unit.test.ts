import { describe, expect, it } from "vitest";
import { detectLanguage, heuristicAnalysis } from "@/lib/agent/analysis";
import { maskEmail, maskPii, normalizePhone, scoreLead } from "@/lib/agent/actions";
import { buildSlots, scheduleFromHours } from "@/lib/seed/reset";
import { addDaysIso, istToUtc } from "@/lib/time";

describe("language detection", () => {
  it("detects Devanagari as Hindi", () => {
    expect(detectLanguage("कल शाम का स्लॉट है क्या?")).toBe("hi");
  });
  it("detects Roman Hindi as Hinglish", () => {
    expect(detectLanguage("Kal shaam ko teeth cleaning ka slot hai kya?")).toBe("hinglish");
  });
  it("keeps plain English as English", () => {
    expect(detectLanguage("Do you accept Star Health insurance?")).toBe("en");
  });
});

describe("safety heuristics", () => {
  it("flags emergencies", () => {
    expect(heuristicAnalysis("My cheek is swollen and I can't breathe properly").emergency).toBe(true);
  });
  it("flags explicit human requests in Hinglish", () => {
    expect(heuristicAnalysis("mujhe kisi se baat karni hai, real person please").wantsHuman).toBe(true);
  });
  it("reads anger as negative sentiment", () => {
    expect(heuristicAnalysis("This is a fraud, worst clinic ever").sentiment).toBeLessThan(-0.5);
  });
});

describe("customer identity", () => {
  it("normalises Indian numbers to the last ten digits", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizePhone("098765-43210")).toBe("9876543210");
    expect(normalizePhone("12")).toBeNull();
  });
  it("masks PII in logged tool inputs", () => {
    expect(maskEmail("adwait@example.com")).toBe("ad****@example.com");
    expect(maskPii({ phone: "9876543210", service: "cleaning" })).toEqual({ phone: "********10", service: "cleaning" });
  });
});

describe("lead scoring", () => {
  it("scores urgent, reachable leads higher", () => {
    const hot = scoreLead({ phone: "9876543210", email: "a@b.co", budget: "1 lakh", timeline: "this week", interest: "Clear aligners for front teeth" });
    const cold = scoreLead({ email: "a@b.co", interest: "aligners" });
    expect(hot).toBeGreaterThan(cold);
    expect(hot).toBeLessThanOrEqual(100);
  });
});

describe("time and scheduling in Asia/Kolkata", () => {
  it("converts IST wall clock to UTC", () => {
    expect(istToUtc("2026-10-29", "17:00").toISOString()).toBe("2026-10-29T11:30:00.000Z");
  });
  it("adds days across month boundaries", () => {
    expect(addDaysIso("2026-10-31", 1)).toBe("2026-11-01");
  });
  it("builds half hour slots only inside working shifts", () => {
    const slots = buildSlots("b", [{ id: "s", locationId: null, schedule: { 4: [["16:00", "18:00"]] } }], "2026-10-29", 1);
    expect(slots).toHaveLength(4);
    expect(slots[0].startsAt.toISOString()).toBe("2026-10-29T10:30:00.000Z");
  });
  it("derives a weekly schedule from published hours with a sensible default", () => {
    expect(scheduleFromHours([{ day: "mon", open: "09:00", close: "17:00" }])[1]).toEqual([["09:00", "17:00"]]);
    expect(Object.keys(scheduleFromHours([]))).toHaveLength(5);
  });
});
