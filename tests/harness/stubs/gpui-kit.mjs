// Stand-in for gpui-kit (see ../elements.mjs): the element builders record
// into a tree instead of drawing. A view is a plain class; the harness calls
// init, render and close itself.
import { El, div, image } from "../elements.mjs";

export class View {}
export { div, image };
export function svg(path) {
  return new El("svg", path);
}
