// Native disclosure and History events simulated around the real client component.
// No browser geometry, network, database, or claim of iPhone verification.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const load = Module._load, resolve = Module._resolveFilename;
const effects = [], ref = { current: null };
global.window = new EventTarget();
global.Element = class { constructor(action = null) { this.action = action; } closest(selector) { assert.equal(selector, 'a, button'); return this.action; } };
Module._resolveFilename = function(name, ...args) { return resolve.call(this, name.startsWith('@/') ? path.resolve(name.slice(2)) : name, ...args); };
Module._load = function(name, ...args) {
  if (name === 'react') return { useRef: () => ref, useEffect: effect => effects.push(effect) };
  if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  return load.call(this, name, ...args);
};
require.extensions['.tsx'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText, file);
const { MobileMenu } = require('../app/showroom/MobileMenu.tsx');
const children = { synthetic: 'existing navigation' };
const tree = MobileMenu({ children });
assert.equal(tree.type, 'details'); assert.equal(tree.props.className, 'site-mobile-menu');
const [summary, nav] = tree.props.children;
assert.equal(summary.type, 'summary'); assert.equal(summary.props.onClick, undefined, 'native open/close remains intact');
assert.equal(nav.props.children, children);
const element = { open: false }; tree.props.ref.current = element;
const cleanup = effects.map(effect => effect());
for (const destination of ['catalog', 'fitting', 'contacts', 'favorites', 'same route', 'rental hash', 'assistant button']) {
  element.open = true; // Native summary opening, including reopening after previous selection.
  nav.props.onClick({ target: new Element({ destination }) });
  assert.equal(element.open, false, `selection must close menu: ${destination}`);
}
element.open = true; nav.props.onClick({ target: new Element() });
assert.equal(element.open, true, 'non-action navigation space does not close disclosure');
for (const direction of ['Back', 'Forward']) {
  element.open = true; window.dispatchEvent(new Event('popstate'));
  assert.equal(element.open, false, `${direction} closes restored open menu`);
}
element.open = true; window.dispatchEvent(new Event('hashchange')); assert.equal(element.open, false);
cleanup.forEach(dispose => dispose());
element.open = true; window.dispatchEvent(new Event('popstate')); window.dispatchEvent(new Event('hashchange'));
assert.equal(element.open, true, 'unmount removes History listeners');
console.log('PASS: mobile menu closes on repeated link/button selection, same-route/hash actions and simulated Back/Forward; native reopen, non-action clicks and listener cleanup preserved. Component mock only, not browser/mobile acceptance.');
