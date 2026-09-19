import { readFile } from 'node:fs/promises';
import { Profile, digest, type AppProfile } from '../src/profile.js';
import { Artifact, type Capability } from '../src/schema.js';

export async function loadProfile(origin?: string): Promise<AppProfile> {
  const p = Profile.parse(JSON.parse(await readFile('config/demo-profile.json','utf8')));
  if (origin) p.origin = origin;
  return p;
}
export async function fixture(profile: AppProfile): Promise<Capability> {
  const contract = JSON.parse(await readFile('config/lookup-contract.json','utf8'));
  return Artifact.parse({...contract,schemaVersion:'1.0',capabilityVersion:'1.0.0',app:{product:profile.product,version:profile.version,profileDigest:digest(profile)},targets:profile.targets,success:profile.success,
    provenance:{kind:'authored_fixture',runId:'offline-fixture',createdAt:'2026-09-18T00:00:00.000Z'},
    steps:[
      {id:'entry',action:{type:'navigate',path:'/app'},checkpoint:{target:'searchReady',text:'Member search'}},
      {id:'fillMember',action:{type:'fill',target:'memberId',input:'memberId'}},
      {id:'search',action:{type:'click',target:'search'},checkpoint:{target:'resultsReady',text:'Search results'}},
      {id:'openMember',action:{type:'click',target:'openMember'},checkpoint:{target:'memberReady',text:'Member overview'}},
      {id:'openSavings',action:{type:'click',target:'savings'},checkpoint:profile.success},
      {id:'readBalance',action:{type:'extract',target:'balance',output:'balance'}},
      {id:'readCurrency',action:{type:'extract',target:'currency',output:'currency'}},
    ]});
}
