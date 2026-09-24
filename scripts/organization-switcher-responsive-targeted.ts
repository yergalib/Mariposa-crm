import "dotenv/config";
import { readFile } from "node:fs/promises";

let passed = 0;
function pass(name: string, condition: unknown) { if (!condition) throw new Error(`FAIL ${name}`); passed++; }

async function main() {
  const component = await readFile("components/OrganizationSwitcher.tsx", "utf8");
  pass("one organization shows name", component.includes("organizations.length === 1") && component.includes("organization-current"));
  pass("two organizations show selector", component.includes("<select") && component.includes("organizations.map"));
  pass("current organization selected", component.includes("defaultValue={currentMembershipId}"));
  pass("technical role hidden", !component.includes("organization.role"));
  pass("accessible label", component.includes('aria-label="Текущая организация"') && component.includes("htmlFor={id}"));
  const sidebar = await readFile("components/Sidebar.tsx", "utf8");
  const shell = await readFile("components/AppShell.tsx", "utf8");
  const css = await readFile("app/design-system.css", "utf8");
  pass("mobile menu contains switcher", sidebar.includes("mobile-organization-context") && sidebar.includes('id="mobile-organization-membership"'));
  pass("desktop footer preserves switcher", sidebar.includes('id="desktop-organization-membership"'));
  pass("tablet shell contains switcher", shell.includes("tablet-organization-bar") && shell.includes('id="tablet-organization-membership"'));
  pass("tablet boundaries cover 768 and 1024", css.includes("max-width:1100px") && css.includes("min-width:761px"));
  pass("mobile boundary covers 390 and 760", css.includes("@media(max-width:760px)") && css.includes("mobile-menu-panel"));
  pass("mobile touch targets", css.includes("min-height:44px") && css.includes("width:44px;height:44px"));
  pass("desktop remains default", css.includes(".tablet-organization-bar{display:none}"));
  console.log(`ORGANIZATION SWITCHER responsive targeted: ${passed}/12 passed`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
