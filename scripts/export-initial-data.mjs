import { mkdir, writeFile } from "node:fs/promises";
import { seed, validateData } from "../src/core.js";
import { baselineCatalog, upgradeCatalog } from "../src/catalog.js";
// Reference-only initialization: never read a user's nova-data.json.
const data = seed();
data.catalog = upgradeCatalog(baselineCatalog());
validateData(data);
const dir = new URL("../data/", import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL("initial-workspace.json", dir), JSON.stringify(data, null, 2) + "\n");
console.log("data/initial-workspace.json: initial personnel/settings and Catalog v2; no live user data");
