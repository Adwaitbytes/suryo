import { seedClinic } from "@/lib/seed/reset";
import { seedStore } from "@/lib/seed/store";

const started = Date.now();
const clinic = await seedClinic();
const store = await seedStore();
console.log(`Seeded demo clinic ${clinic} and demo store ${store} in ${Date.now() - started} ms`);
process.exit(0);
