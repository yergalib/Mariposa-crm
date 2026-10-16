// Child-process-only guard for the isolated compilation check.
const blocked=()=>{process.stderr.write('ISOLATED_BUILD_NETWORK_BLOCKED\n');throw Error('ISOLATED_BUILD_NETWORK_BLOCKED')};
require('node:net').Socket.prototype.connect=blocked;
require('node:tls').connect=blocked;
require('node:dgram').createSocket=blocked;
globalThis.fetch=blocked;
