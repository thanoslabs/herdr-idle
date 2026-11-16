// Makes `import "herdr"`, `"gpui-kit"` and `"gpui-base"` resolve to the
// harness's stand-ins (see hooks.mjs). Imported by view.mjs before it imports
// main.js (dynamically, so the hooks are in place first); main.js itself is
// never changed. Can also be preloaded: node --import ./tests/harness/register.mjs.

import * as module from "node:module";
import { resolve } from "./hooks.mjs";

if (!globalThis.__herdrHarnessHooks) {
  globalThis.__herdrHarnessHooks = true;
  if (typeof module.registerHooks === "function") module.registerHooks({ resolve });
  else if (typeof module.register === "function") module.register("./hooks.mjs", import.meta.url);
  else throw new Error(`The view harness needs Node 20.6 or later (module.register); this is ${process.version}`);
}
