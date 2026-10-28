import type { BusinessProfile, Persona } from "@/lib/contracts";

export const CLINIC_SLUG = "kesar";

export const clinicProfile: BusinessProfile = {
  name: "Kesar Dental & Skin",
  tagline: "Dental and skin care across Indore, open six and a half days a week",
  description:
    "Kesar Dental & Skin is a multi location dental and dermatology clinic in Indore with branches in Vijay Nagar and Palasia. Five specialists cover general and cosmetic dentistry, orthodontics, oral surgery and implants, dermatology and cosmetology.",
  industry: "Healthcare: dental and dermatology clinic",
  services: [],
  hours: [
    { day: "mon", open: "10:00", close: "20:00" },
    { day: "tue", open: "10:00", close: "20:00" },
    { day: "wed", open: "10:00", close: "20:00" },
    { day: "thu", open: "10:00", close: "20:00" },
    { day: "fri", open: "10:00", close: "20:00" },
    { day: "sat", open: "10:00", close: "20:00" },
    { day: "sun", open: "12:00", close: "15:00" },
  ],
  locations: [],
  contact: {
    phone: "+91 731 400 2211",
    email: "care@kesarclinic.in",
    whatsapp: "+91 98260 11220",
  },
  bookingRules: [
    "Appointments are 30 minutes and can be booked up to 14 days ahead.",
    "Free cancellation or rescheduling up to 4 hours before the appointment.",
    "Late cancellations and no shows carry a 200 rupee fee adjusted on the next visit.",
    "Patients under 18 must be accompanied by a parent or guardian.",
  ],
  bookableOffering: "Appointment",
  toneOfVoice: "Warm, calm and precise, like a senior front desk coordinator who knows every doctor personally",
  languages: ["English", "Hindi", "Hinglish"],
};

export const clinicPersona: Persona = {
  agentName: "Riya",
  greeting: "Hi, this is Riya from Kesar Dental and Skin. How can I help you today?",
  style:
    "Short sentences. Warm but efficient. Mirrors the caller's language: English, Hindi or Hinglish. Never gives medical advice.",
  voice: "Aoede",
};

export const clinicLocations = [
  {
    key: "vijay",
    name: "Vijay Nagar",
    address: "2nd floor, Orbit Square, Scheme 54, Vijay Nagar, Indore 452010",
    phone: "+91 731 400 2211",
  },
  {
    key: "palasia",
    name: "Palasia",
    address: "14 Race Course Road, near Geeta Bhawan Square, New Palasia, Indore 452001",
    phone: "+91 731 400 2212",
  },
] as const;

type LocationKey = (typeof clinicLocations)[number]["key"];

type Shift = [string, string];
export type DoctorSeed = {
  name: string;
  title: string;
  specialties: string[];
  languages: string[];
  location: LocationKey;
  /** Weekday index (0 Sunday) to working shifts in IST. */
  schedule: Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, Shift[]>>;
};

const weekdays = (days: number[], shifts: Shift[]) =>
  Object.fromEntries(days.map((d) => [d, shifts])) as DoctorSeed["schedule"];

export const clinicDoctors: DoctorSeed[] = [
  {
    name: "Dr. Ananya Mehta",
    title: "General and Cosmetic Dentist",
    specialties: ["dentist"],
    languages: ["English", "Hindi"],
    location: "vijay",
    schedule: weekdays([1, 2, 3, 4, 5, 6], [["10:00", "13:00"], ["16:00", "20:00"]]),
  },
  {
    name: "Dr. Rohan Joshi",
    title: "Orthodontist",
    specialties: ["orthodontist", "dentist"],
    languages: ["English", "Hindi", "Marathi"],
    location: "palasia",
    schedule: weekdays([2, 4, 6], [["11:00", "14:00"], ["17:00", "20:00"]]),
  },
  {
    name: "Dr. Vikram Rathore",
    title: "Oral and Implant Surgeon",
    specialties: ["surgeon"],
    languages: ["English", "Hindi"],
    location: "vijay",
    schedule: weekdays([1, 3, 5], [["10:00", "14:00"]]),
  },
  {
    name: "Dr. Farah Siddiqui",
    title: "Consultant Dermatologist",
    specialties: ["dermatologist"],
    languages: ["English", "Hindi", "Urdu"],
    location: "palasia",
    schedule: weekdays([1, 2, 3, 4, 5, 6], [["11:00", "14:00"], ["16:00", "19:00"]]),
  },
  {
    name: "Dr. Neha Kulkarni",
    title: "Cosmetologist",
    specialties: ["cosmetologist"],
    languages: ["English", "Hindi"],
    location: "vijay",
    schedule: {
      ...weekdays([2, 3, 4, 5, 6], [["12:00", "15:00"], ["17:00", "20:00"]]),
      0: [["12:00", "15:00"]],
    },
  },
];

export type ServiceSeed = {
  name: string;
  category: "Dental" | "Orthodontics" | "Oral surgery" | "Dermatology" | "Cosmetology";
  specialty: string;
  durationMin: number;
  priceInr: number | null;
  priceNote?: string;
  description: string;
};

export const clinicServices: ServiceSeed[] = [
  {
    name: "Dental consultation",
    category: "Dental",
    specialty: "dentist",
    durationMin: 20,
    priceInr: 400,
    description: "Full oral check up with a dentist. Fee is adjusted if treatment starts the same day.",
  },
  {
    name: "Teeth cleaning and polishing",
    category: "Dental",
    specialty: "dentist",
    durationMin: 30,
    priceInr: 1200,
    description: "Scaling and polishing to remove plaque and stains. Recommended every six months.",
  },
  {
    name: "Tooth coloured filling",
    category: "Dental",
    specialty: "dentist",
    durationMin: 30,
    priceInr: 1500,
    priceNote: "per tooth",
    description: "Composite filling for cavities, matched to the natural tooth shade.",
  },
  {
    name: "Teeth whitening",
    category: "Dental",
    specialty: "dentist",
    durationMin: 60,
    priceInr: 8500,
    description: "In clinic whitening session, usually 4 to 6 shades brighter in one visit.",
  },
  {
    name: "Root canal treatment",
    category: "Oral surgery",
    specialty: "surgeon",
    durationMin: 60,
    priceInr: 4500,
    priceNote: "front teeth from 4,500, molars up to 7,500, crown extra",
    description: "Single or multi sitting root canal under local anaesthesia.",
  },
  {
    name: "Tooth extraction",
    category: "Oral surgery",
    specialty: "surgeon",
    durationMin: 30,
    priceInr: 1000,
    priceNote: "simple extraction from 1,000, wisdom tooth surgery from 4,000",
    description: "Simple or surgical extraction including wisdom teeth.",
  },
  {
    name: "Dental implant consultation",
    category: "Oral surgery",
    specialty: "surgeon",
    durationMin: 30,
    priceInr: 800,
    description: "Assessment and treatment plan for implants. Implants start at 28,000 per tooth including crown.",
  },
  {
    name: "Braces and aligners consultation",
    category: "Orthodontics",
    specialty: "orthodontist",
    durationMin: 30,
    priceInr: 600,
    description: "Orthodontic assessment for metal braces, ceramic braces or clear aligners.",
  },
  {
    name: "Dermatology consultation",
    category: "Dermatology",
    specialty: "dermatologist",
    durationMin: 20,
    priceInr: 700,
    description: "Consultation for acne, pigmentation, hair fall, eczema and other skin concerns.",
  },
  {
    name: "Chemical peel",
    category: "Dermatology",
    specialty: "dermatologist",
    durationMin: 45,
    priceInr: 3000,
    description: "Medical grade peel for acne marks and pigmentation. Requires a prior consultation.",
  },
  {
    name: "Laser hair reduction",
    category: "Cosmetology",
    specialty: "cosmetologist",
    durationMin: 45,
    priceInr: 2500,
    priceNote: "per session for small areas, full face 3,500",
    description: "Diode laser sessions, usually 6 to 8 sessions four weeks apart.",
  },
  {
    name: "HydraFacial",
    category: "Cosmetology",
    specialty: "cosmetologist",
    durationMin: 45,
    priceInr: 4000,
    description: "Deep cleansing, exfoliation and hydration facial with no downtime.",
  },
];

/**
 * Knowledge base articles. Every factual answer the agent gives must come from here
 * (or from live availability), which is what makes "grounded" verifiable.
 */
export const clinicKnowledge: Array<{ title: string; content: string }> = [
  {
    title: "About Kesar Dental & Skin",
    content:
      "Kesar Dental & Skin is a dental and dermatology clinic in Indore with two branches: Vijay Nagar and Palasia. We have five specialists: Dr. Ananya Mehta (general and cosmetic dentist), Dr. Rohan Joshi (orthodontist), Dr. Vikram Rathore (oral and implant surgeon), Dr. Farah Siddiqui (dermatologist) and Dr. Neha Kulkarni (cosmetologist). The clinic has been serving Indore since 2014.",
  },
  {
    title: "Locations and directions",
    content:
      "Vijay Nagar branch: 2nd floor, Orbit Square, Scheme 54, Vijay Nagar, Indore 452010. Lift available, parking in the basement for two hours free. Palasia branch: 14 Race Course Road, near Geeta Bhawan Square, New Palasia, Indore 452001. Ground floor, wheelchair accessible, street parking. Dr. Mehta, Dr. Rathore and Dr. Kulkarni sit at Vijay Nagar. Dr. Joshi and Dr. Siddiqui sit at Palasia.",
  },
  {
    title: "Opening hours",
    content:
      "Monday to Saturday 10 AM to 8 PM at both branches. Sunday 12 PM to 3 PM at Vijay Nagar only, for cosmetology appointments with Dr. Neha Kulkarni. The clinic is closed on Diwali, Holi and Independence Day. Phone lines are answered by Riya, our assistant, 24 hours a day.",
  },
  {
    title: "Doctor schedules",
    content:
      "Dr. Ananya Mehta: Monday to Saturday, 10 AM to 1 PM and 4 PM to 8 PM, Vijay Nagar. Dr. Rohan Joshi: Tuesday, Thursday and Saturday, 11 AM to 2 PM and 5 PM to 8 PM, Palasia. Dr. Vikram Rathore: Monday, Wednesday and Friday, 10 AM to 2 PM, Vijay Nagar. Dr. Farah Siddiqui: Monday to Saturday, 11 AM to 2 PM and 4 PM to 7 PM, Palasia. Dr. Neha Kulkarni: Tuesday to Saturday 12 PM to 3 PM and 5 PM to 8 PM, Sunday 12 PM to 3 PM, Vijay Nagar.",
  },
  {
    title: "Dental prices",
    content:
      "Dental consultation 400 rupees, adjusted if treatment starts the same day. Teeth cleaning and polishing 1,200 rupees. Tooth coloured filling 1,500 rupees per tooth. Teeth whitening 8,500 rupees per session. Root canal treatment from 4,500 rupees for front teeth up to 7,500 for molars, crown extra (ceramic crown 6,000, zirconia crown 12,000). Simple extraction from 1,000 rupees, wisdom tooth surgery from 4,000. Dental implants from 28,000 rupees per tooth including the crown. Implant consultation 800 rupees.",
  },
  {
    title: "Orthodontic prices",
    content:
      "Braces and aligners consultation 600 rupees, including an X ray review. Metal braces from 35,000 rupees for the full treatment. Ceramic braces from 50,000 rupees. Clear aligners from 1,20,000 rupees. No cost EMI is available for orthodontic treatment over 6 or 12 months through Bajaj Finserv.",
  },
  {
    title: "Skin and cosmetology prices",
    content:
      "Dermatology consultation 700 rupees, follow up within 14 days free. Chemical peel 3,000 rupees per session, needs a prior consultation. Laser hair reduction 2,500 rupees per session for small areas such as upper lip or underarms, full face 3,500 rupees, packages of 6 sessions get 15 percent off. HydraFacial 4,000 rupees. Prices include GST.",
  },
  {
    title: "Payments and insurance",
    content:
      "We accept UPI, all major debit and credit cards, and cash. No cost EMI is available on bills above 10,000 rupees. We are empanelled for cashless dental treatment with Star Health and HDFC Ergo for accidental dental injury only. For other insurers we provide itemised bills for reimbursement. Cosmetic treatments such as whitening, laser and facials are not covered by insurance.",
  },
  {
    title: "Cancellation and rescheduling policy",
    content:
      "You can cancel or reschedule for free up to 4 hours before your appointment, by phone, chat or WhatsApp. Late cancellations and no shows carry a 200 rupee fee that is adjusted on your next visit. Appointments are 30 minute slots and can be booked up to 14 days ahead.",
  },
  {
    title: "Refunds and billing disputes",
    content:
      "Refunds for prepaid packages are processed within 7 working days to the original payment method, minus sessions already used. Billing questions and disputes are handled by our billing desk, which a human coordinator reviews the same working day. The assistant can open a billing ticket but cannot change or waive charges.",
  },
  {
    title: "Teeth cleaning: before and after",
    content:
      "Before cleaning: no special preparation needed, brush as usual. After cleaning: mild sensitivity for a day or two is normal. Avoid very hot, cold or coloured food and drinks like tea, coffee and turmeric for 2 hours. We recommend cleaning every six months.",
  },
  {
    title: "Root canal: before and after",
    content:
      "Before a root canal, eat a light meal and take any regular medicines as usual unless your doctor advised otherwise. After the procedure, avoid chewing on that side until the crown is placed. Some tenderness for 2 to 3 days is common. If you have swelling, fever or severe pain, contact the clinic or emergency services.",
  },
  {
    title: "Teeth whitening: before and after",
    content:
      "Whitening is suitable for adults with healthy gums. A cleaning is recommended before whitening for best results. For 48 hours after whitening avoid tea, coffee, red wine, cola and smoking. Results typically last 12 to 18 months.",
  },
  {
    title: "Laser hair reduction: before and after",
    content:
      "Before laser: shave the area a day before, do not wax or thread for 4 weeks, avoid sun exposure and self tanning for 2 weeks. After laser: mild redness for a few hours is normal, use sunscreen and avoid hot showers, gym and swimming for 24 hours. Sessions are 4 weeks apart.",
  },
  {
    title: "Chemical peel and HydraFacial aftercare",
    content:
      "After a chemical peel, skin may flake for 3 to 5 days. Do not pick at peeling skin, use a gentle cleanser, moisturiser and SPF 50 sunscreen, and avoid retinol for a week. HydraFacial has no downtime and makeup can be applied the same day.",
  },
  {
    title: "Children and first visits",
    content:
      "We see children from age 3 for dental check ups. Patients under 18 must come with a parent or guardian. For a first visit please arrive 10 minutes early with any previous X rays or prescriptions.",
  },
  {
    title: "Dental emergencies",
    content:
      "For severe facial swelling, difficulty breathing or swallowing, uncontrolled bleeding or injury after an accident, call 108 or go to the nearest hospital emergency immediately. For a knocked out tooth, keep it in milk and reach the clinic within an hour. During clinic hours we keep emergency slots with Dr. Mehta and Dr. Rathore.",
  },
  {
    title: "Medical advice policy",
    content:
      "Riya, our assistant, cannot diagnose conditions, recommend medicines or dosages, or interpret X rays and reports. For any clinical question she books a consultation or connects you to a doctor's assistant.",
  },
  {
    title: "Privacy",
    content:
      "Your records are kept confidential and only shared with your treating doctor. Call and chat transcripts are stored securely for quality and are never sold. You can ask for your data to be deleted by emailing care@kesarclinic.in.",
  },
  {
    title: "Contact",
    content:
      "Phone +91 731 400 2211 (Vijay Nagar) and +91 731 400 2212 (Palasia). WhatsApp +91 98260 11220. Email care@kesarclinic.in.",
  },
];
