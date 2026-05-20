// ── Lazy Module Loader ──
// Dynamically imports a handler module at runtime and caches the result.
// This reduces cold start size because handlers are only compiled when first called.

type HandlerModule = { default?: (req: any, ctx: any) => Promise<Response>; handler?: (req: any, ctx: any) => Promise<Response> };

const moduleCache = new Map<string, HandlerModule>();

const MODULE_MAP: Record<string, string> = {
  "analyze": "../dev-engine-v2/handlers/analyze.ts",
  "notes": "../dev-engine-v2/handlers/analyze.ts",
  "options": "../dev-engine-v2/handlers/analyze.ts",
  "rewrite-plan": "../dev-engine-v2/handlers/rewrite-plan.ts",
  "rewrite-chunk": "../dev-engine-v2/handlers/rewrite-chunk.ts",
  "rewrite-assemble": "../dev-engine-v2/handlers/rewrite-assemble.ts",
  "rewrite": "../dev-engine-v2/handlers/rewrite-single.ts",
  "convert": "../dev-engine-v2/handlers/convert.ts",
  "ping": null, // handled in index.ts
  "fix_stuck_version": null, // handled in index.ts
};

export async function loadHandler(action: string): Promise<HandlerModule | null> {
  if (moduleCache.has(action)) return moduleCache.get(action)!;
  
  const modulePath = MODULE_MAP[action];
  if (!modulePath) return null; // handled inline in index.ts

  const mod: HandlerModule = await import(modulePath);
  moduleCache.set(action, mod);
  return mod;
}

export function getModuleMap(): Record<string, string> {
  return { ...MODULE_MAP };
}
