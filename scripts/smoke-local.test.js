import test from 'node:test';
import assert from 'node:assert/strict';
import {smokeLocal} from './smoke-local.js';
test('smoke fails for unreachable and degraded dependencies without hiding their names',async()=>{
 await assert.rejects(smokeLocal('https://production.test'),/loopback/);
 await assert.rejects(smokeLocal('http://localhost:8787',async()=>{throw Error();}),/cannot reach/);
 await assert.rejects(smokeLocal('http://localhost:8787',async()=>Response.json({dependencies:{config:{status:'error',code:'NOT_CONFIGURED'}}},{status:503})),/config: NOT_CONFIGURED/);
});
