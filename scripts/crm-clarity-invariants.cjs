// Compare existing mutation bindings and input constraints against the integration base.
// Local git + AST only; no service, database or network import.
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),ts=require('typescript');
const base='29b03b2';
const newComponents=new Set(['app/chats/ClaimInquiryForm.tsx','components/RevealSectionLink.tsx']);
const files=cp.execFileSync('git',['-c','core.safecrlf=false','diff','--name-only',base],{encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>p.endsWith('.tsx')&&!newComponents.has(p));
function collect(text){const ast=ts.createSourceFile('screen.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),actions=[],inputs=[];
 function walk(node){if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
  const attrs=node.attributes.properties.filter(ts.isJsxAttribute);const tag=node.tagName.getText(ast);
  for(const attr of attrs)if(attr.name.text==='action'&&(tag==='form'||tag==='RetainedActionForm'))actions.push(attr.initializer?.getText(ast).replace(/\s+/g,'')??'');
  if(tag==='input'||tag==='textarea')inputs.push(attrs.filter(a=>['name','type','value','required','min','max','minLength','maxLength','pattern'].includes(a.name.text)).map(a=>a.getText(ast).replace(/\s+/g,'')).sort().join('|'));
 }ts.forEachChild(node,walk);}walk(ast);return {actions:actions.sort(),inputs:inputs.sort()};}
for(const file of files){const old=cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'});assert.deepEqual(collect(fs.readFileSync(file,'utf8')),collect(old),file+' changed an existing mutation binding/input constraint');}
assert.equal(cp.execFileSync('git',['diff','--name-only',base,'--','lib','prisma','app/showroom','app/payroll'],{encoding:'utf8'}).trim(),'');
const routes=JSON.parse(fs.readFileSync('docs/CRM-CLARITY-ROUTES.json','utf8'));
assert.equal(routes.length,83);assert.equal(routes.filter(r=>!r.coverage.startsWith('Excluded')).length,75);
const result={status:'PASS',existingRouteAndComponentFiles:files.length,mutationBindingsAndInputConstraints:'unchanged',backendSchemaShowroomPayroll:'unchanged',routesInventoried:83,routesCovered:75,excluded:8};
fs.writeFileSync('crm-clarity-evidence/invariants.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
