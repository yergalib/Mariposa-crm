// Offline component regression: committed period versus temporary calendar fields.
const assert = require('node:assert/strict'), fs = require('node:fs');
const path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const load = Module._load, resolve = Module._resolveFilename;
let slots = [], cursor = 0;
const state = initial => {
  const index = cursor++;
  if (!(index in slots)) slots[index] = initial;
  return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
};
const DayPicker = () => null;
Module._resolveFilename = function(id, ...args) {
  return resolve.call(this, id.startsWith('@/') ? path.resolve(id.slice(2)) : id, ...args);
};
Module._load = function(id, ...args) {
  if (id === 'react') return {useState: state, useId: () => 'period', useRef: value => state({current: value})[0]};
  if (id === 'react/jsx-runtime') return {jsx: (type, props) => ({type, props}), jsxs: (type, props) => ({type, props})};
  if (id === '@daypicker/react') return {DayPicker};
  if (id === '@daypicker/react/locale' || id.endsWith('.css')) return {};
  if (id === 'next/link') return () => null;
  if (id === './AssistantLink') return {AssistantLink: () => null};
  return load.call(this, id, ...args);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}
}).outputText, f);
const {RentalDateRange} = require('../app/showroom/RentalDateRange.tsx');
const {CatalogAvailability} = require('../app/showroom/CatalogAvailability.tsx');
const {rentalPeriod} = require('../lib/showroom/period.ts');
function all(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => all(child, predicate))];
}
const find = (tree, predicate) => { const node = all(tree, predicate)[0]; assert.ok(node, 'expected element'); return node; };
const render = props => { cursor = 0; return RentalDateRange({timezone: 'Asia/Almaty', ...props}); };
const times = tree => all(tree, n => n.type === 'input' && n.props.type === 'time');
const values = tree => Object.fromEntries(all(tree, n => n.type === 'input' && n.props.type === 'hidden').map(n => [n.props.name, n.props.value]));
const button = (tree, label) => find(tree, n => n.type === 'button' && n.props.children === label);

for (const required of [false, true]) {
  slots = [];
  let tree = render({required});
  assert.deepEqual(values(tree), {from: '', until: ''});
  assert.equal(times(tree).length, 0);
  assert.ok(times(tree).every(n => n.props.disabled === true), 'closed calendar draft must not block parent form');
  find(tree, n => n.props?.className === 'rental-period-trigger').props.onClick();
  tree = render({required});
  assert.ok(times(tree).every(n => !n.props.disabled && n.props.required), 'open picker still requires both times');
  assert.equal(button(tree, 'Применить даты').props.disabled, true);
  const day = new Date(Date.now() + 3 * 86400000);
  find(tree, n => n.type === DayPicker).props.onSelect(undefined, day);
  tree = render({required});
  assert.equal(button(tree, 'Применить даты').props.disabled, true, 'partial period cannot apply');
  assert.deepEqual(values(tree), {from: '', until: ''}, 'draft is not committed');
  const end = new Date(day.getTime() + 86400000);
  find(tree, n => n.type === DayPicker).props.onSelect({from: day, to: end}, end);
  tree = render({required});
  assert.equal(button(tree, 'Применить даты').props.disabled, false);
  button(tree, 'Применить даты').props.onClick();
  tree = render({required});
  const committed = values(tree);
  rentalPeriod(committed.from, committed.until, 'Asia/Almaty');
  assert.ok(times(tree).every(n => n.props.disabled), 'applied period is submitted by hidden inputs');
  find(tree, n => n.props?.className === 'rental-period-trigger').props.onClick();
  tree = render({required});
  find(tree, n => n.type === DayPicker).props.onSelect(undefined,new Date(Date.now()+4*86400000));
  button(tree, 'Отмена').props.onClick();
  tree = render({required});
  assert.deepEqual(values(tree), committed, 'cancel preserves applied dates');
  assert.ok(times(tree).every(n => n.props.disabled), 'cancelled incomplete draft cannot block parent');
  find(tree, n => n.props?.className === 'rental-period-trigger').props.onClick();
  button(render({required}), 'Очистить даты').props.onClick();
  assert.deepEqual(values(render({required})), {from: '', until: ''});
}
slots = []; cursor = 0;
const catalog = CatalogAvailability({branches: [], categories: [], filters: {colorGroup: 'white', size: '140', search: ''}, children: null});
const form = find(catalog, n => n.type === 'form');
assert.equal(form.props.method, 'get');
assert.equal(find(form, n => n.props?.name === 'colorGroup').props.defaultValue, 'white');
assert.equal(find(form, n => n.props?.name === 'size').props.defaultValue, '140');
assert.equal(find(form, n => n.type === RentalDateRange).props.required, undefined);
assert.throws(() => rentalPeriod('', '', 'Asia/Almaty'));
assert.throws(() => rentalPeriod('2099-01-01T12:00', '', 'Asia/Almaty'));
console.log('PASS: optional catalogue GET; closed drafts excluded; date-only with no clock inputs; partial blocked; valid apply/cancel/clear; period validation preserved. Offline only.');
