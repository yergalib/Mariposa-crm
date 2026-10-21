const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'inquiry-visibility-evidence');
for(const name of ['.env','.env.local','.env.production','.env.production.local'])if(fs.existsSync(path.join(root,name)))throw Error('Unexpected env file');
const env={NEXT_TELEMETRY_DISABLED:'1',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/fixture',NODE_OPTIONS:'--require "'+path.join(root,'scripts/owner-day-offline-network.cjs').replaceAll('\\','/')+'"'};
for(const key of ['SystemRoot','WINDIR','TEMP','TMP','PATH'])if(process.env[key])env[key]=process.env[key];
fs.mkdirSync(out,{recursive:true});const fd=fs.openSync(path.join(out,'build.log'),'w');
const result=spawnSync(process.execPath,['node_modules/next/dist/bin/next','build','--webpack'],{cwd:root,env,stdio:['ignore',fd,fd],windowsHide:true});fs.closeSync(fd);
fs.writeFileSync(path.join(out,'build.json'),JSON.stringify({exitCode:result.status,networkBlocked:true,liveDatabaseUsed:false,realModelCalls:0},null,2));console.log('Build exit: '+result.status);process.exitCode=result.status??1;
