import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const routesDir = resolve(process.cwd(), "src/routes");
const conflicts = [];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));

  if (names.has("+page.svelte") && names.has("+page.svx")) {
    conflicts.push(dir);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const child = resolve(dir, entry.name);
    if (statSync(child).isDirectory()) {
      walk(child);
    }
  }
}

walk(routesDir);

if (conflicts.length > 0) {
  console.error("Duplicate SvelteKit page implementations found:");
  for (const conflict of conflicts) {
    console.error(`- ${conflict}`);
  }
  process.exit(1);
}

console.log("No duplicate +page.svelte/+page.svx route conflicts found.");
