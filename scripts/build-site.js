import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "docs/index.html",
  "docs/assets/styles.css",
  "docs/assets/app.js"
];

for (const file of requiredFiles) {
  await fs.access(path.join(root, file));
}

const snapshotPath = path.join(root, "docs/data/snapshot.json");
try {
  await fs.access(snapshotPath);
} catch {
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.copyFile(path.join(root, "data/snapshot.example.json"), snapshotPath);
}

const css = await fs.readFile(path.join(root, "docs/assets/styles.css"), "utf8");
if (/gradient\s*\(/i.test(css)) {
  throw new Error("Design requirement failed: CSS must not use gradients.");
}

console.log("Static dashboard ready in docs/");
