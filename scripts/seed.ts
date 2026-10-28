import { seedClinic } from "@/lib/seed/reset";

const started = Date.now();
const id = await seedClinic();
console.log(`Seeded demo clinic ${id} in ${Date.now() - started} ms`);
process.exit(0);
