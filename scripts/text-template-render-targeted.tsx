import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";
import { RentalDocumentV1 } from "../components/RentalDocumentV1";
import { RentalDocumentV2 } from "../components/RentalDocumentV2";
import { RentalDocumentV3 } from "../components/RentalDocumentV3";
const root=process.cwd(),out=path.resolve(root,"../template-local-evidence");
const fixture=JSON.parse(fs.readFileSync(path.join(out,"snapshot-fixtures.json"),"utf8"));
for(const file of ["components/RentalDocumentV1.tsx","components/RentalDocumentV2.tsx"]){
  const old=execFileSync("git",["-c","safe.directory="+root.replaceAll("\\","/"),"show","e996775:"+file],{cwd:root}).toString().replaceAll("\r\n","\n");
  assert.equal(fs.readFileSync(path.join(root,file),"utf8").replaceAll("\r\n","\n"),old);
}
const v1=renderToStaticMarkup(<RentalDocumentV1 snapshot={fixture.v1.snapshot} version={2} reason={null}/>);
const v2=renderToStaticMarkup(<RentalDocumentV2 snapshot={fixture.v2.snapshot} version={1} reason={null}/>);
const v3=renderToStaticMarkup(<RentalDocumentV3 snapshot={fixture.v3.snapshot} version={3} reason={null}/>);
assert(v1.length>1000&&v2.length>1000);
assert(v3.includes("&lt;script&gt;window.__templateInjected=true&lt;/script&gt;"));
assert(!v3.includes("<script>window.__templateInjected"));
const base={...fixture.v3.snapshot,schemaVersion:2 as const,templateVersion:2 as const};
assert(v3.startsWith(renderToStaticMarkup(<RentalDocumentV2 snapshot={base} version={3} reason={null}/>)));
const result={status:"PASS",oldRendererSourcesUnchanged:true,v3UsesSameV2Base:true,plainTextEscaped:true,htmlLengths:{v1:v1.length,v2:v2.length,v3:v3.length}};
fs.writeFileSync(path.join(out,"renderer-result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
