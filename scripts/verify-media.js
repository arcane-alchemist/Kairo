import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
let local={};try{local=parseEnv(readFileSync('.dev.vars','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const mediaBase=local.MEDIA_BASE_URL||config.vars.MEDIA_BASE_URL;
const metadata=JSON.stringify({name:'Kairo media connection check',description:'Verifies public artwork storage. No event or token is created.',check:randomUUID()});
const hash=createHash('sha256').update(metadata).digest('hex'),key=`metadata/${hash}.json`;
const directory=mkdtempSync(join(tmpdir(),'kairo-media-')),file=join(directory,'metadata.json');
writeFileSync(file,metadata);
const run=args=>execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','r2','object',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
let uploaded=false;
try {
 run(['put',`${config.r2_buckets[0].bucket_name}/${key}`,'--file',file,'--content-type','application/json','--remote']);uploaded=true;
 const uri=`${mediaBase}${key}`;
 const response=await fetch(uri,{signal:AbortSignal.timeout(15000),redirect:'error'});
 assert.equal(response.status,200,`Public media URL returned HTTP ${response.status}`);
 assert.equal(await response.text(),metadata,'Public media differs from the uploaded bytes');
 console.log(JSON.stringify({status:'PASS',publicBaseUrl:mediaBase,storage:'Existing R2 bucket',websiteDeployed:false}));
} catch(error) {
 console.error('Public media verification failed:',error.message?.startsWith('Command failed:')?'Cloudflare R2 access failed':error.message);process.exitCode=1;
} finally {
 if(uploaded){try{run(['delete',`${config.r2_buckets[0].bucket_name}/${key}`,'--remote']);console.log('Temporary media check object removed.');}catch{console.error('Cleanup needs attention:',key);process.exitCode=1;}}
 rmSync(directory,{recursive:true,force:true});
}
