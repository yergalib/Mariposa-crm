// Local rehearsal entrypoint. Its original loopback/database/directory guard is preserved.
const assert=require('node:assert/strict'),path=require('node:path');
const {compileManifest,executeWorkbookTransaction,sha,uuid}=require('./catalog-workbook-transaction.cjs');
async function executeIsolatedImport(client, plan, options) {
  assert.equal(sha(plan.manifest),plan.canonicalSha,'Compiled manifest changed after review');
  // Even accidental use of DATABASE_URL or a real Supabase connection fails before BEGIN/writes.
  const identity=(await client.query("SELECT current_database() db,host(inet_server_addr()) host,current_setting('data_directory') directory")).rows[0];
  assert.match(identity.db,/^crm_manifest_rehearsal_\d+$/);
  assert.ok(['127.0.0.1','::1'].includes(identity.host));
  assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(options.isolatedDirectory).toLowerCase());
  assert.ok(path.resolve(options.isolatedDirectory).toLowerCase().includes('crm-price-audit'));
  return executeWorkbookTransaction(client,plan,{...options,mode:'apply'});
}
module.exports={compileManifest,executeIsolatedImport,sha,uuid};
