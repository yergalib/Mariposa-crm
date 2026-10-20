// Preloaded into verification and its workers: dummy endpoint must never connect.
const deny=()=>{throw new Error('Offline owner-day verification forbids network access')};
const socket=require('node:net').Socket.prototype,connect=socket.connect;
socket.connect=function(...args){
 const input=Array.isArray(args[0])?args[0][0]:args[0];
 const pipe=typeof input==='string'?input:input?.path;
 if(typeof pipe==='string'&&pipe.startsWith('\\\\.\\pipe\\'))return connect.apply(this,args);
 return deny();
};
require('node:tls').connect=deny;
globalThis.fetch=deny;
