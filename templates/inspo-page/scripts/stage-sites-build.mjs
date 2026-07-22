import { cp, mkdir, readdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const distDirectory = join(projectDirectory, "dist");
const clientDirectory = join(distDirectory, "client");
const serverDirectory = join(distDirectory, "server");

await mkdir(clientDirectory, { recursive: true });

for (const entry of await readdir(distDirectory)) {
  if (entry === "client" || entry === "server") continue;
  await rename(join(distDirectory, entry), join(clientDirectory, entry));
}

await mkdir(serverDirectory, { recursive: true });
await cp(join(projectDirectory, "worker", "index.js"), join(serverDirectory, "index.js"));
