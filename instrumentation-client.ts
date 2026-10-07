// Register before the App Router's popstate listener: a dirty order must be able
// to cancel history traversal before React replaces its form. The guard is only
// installed while the orders/calendar layout is mounted.
declare global {
  interface Window {
    mariposaOrderHistoryGuard?: (event: PopStateEvent, from: number, to: number) => boolean;
  }
}

const key = "mariposaOrderPosition";
let index = typeof history.state?.[key] === "number" ? history.state[key] : 0;
const push = history.pushState, replace = history.replaceState;
replace.call(history, { ...history.state, [key]: index }, "");
history.pushState = function (state, unused, url) {
  push.call(this, { ...state, [key]: ++index }, unused, url);
};
history.replaceState = function (state, unused, url) {
  replace.call(this, { ...state, [key]: index }, unused, url);
};
window.addEventListener("popstate", event => {
  const next = typeof event.state?.[key] === "number" ? event.state[key] : index - 1;
  if (window.mariposaOrderHistoryGuard?.(event, index, next)) return;
  index = next;
}, true);

export {};
