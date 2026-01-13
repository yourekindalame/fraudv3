import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");
const clientDist = path.join(root, "client", "dist");
const serverPublic = path.join(root, "server", "public");

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(clientDist)) {
  console.error(`Client build not found at ${clientDist}. Run: npm -w client run build`);
  process.exit(1);
}

rmrf(serverPublic);
copyDir(clientDist, serverPublic);
console.log(`Copied client build -> server/public (${serverPublic})`);

