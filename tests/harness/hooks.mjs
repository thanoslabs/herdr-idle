// Module resolution for the tests: the app's modules ("herdr", "gpui-kit",
// "gpui-base") exist only inside Herdr, so they resolve to the stand-ins in
// ./stubs/. Used by register.mjs, in-thread with module.registerHooks (Node
// 22.15 and later) or, on an older Node, off-thread with module.register.

const STUBS = {
  herdr: new URL("./stubs/herdr.mjs", import.meta.url).href,
  "gpui-kit": new URL("./stubs/gpui-kit.mjs", import.meta.url).href,
  "gpui-base": new URL("./stubs/gpui-base.mjs", import.meta.url).href,
};

export function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) return { url: STUBS[specifier], shortCircuit: true };
  return nextResolve(specifier, context);
}
