// Structural validation with the user's local Foundry Core. Does not emulate
// dnd5e type models or replace an actual world import and sheet interaction.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
const arg = key => {const i=process.argv.indexOf(key);return i<0?null:process.argv[i+1];};
const core=arg("--core"),system=arg("--system");
if(!core||!system)throw new Error("Usage: node build/verify-core.mjs --core <foundry> --system <dnd5e>");
await import(pathToFileURL(path.join(core,"common/server.mjs")));
const manifest=JSON.parse(fs.readFileSync(path.join(system,"system.json"),"utf8"));
const release=JSON.parse(fs.readFileSync(path.join(core,"package.json"),"utf8")).release;
globalThis.game={system:{...manifest,grid:{type:1,distance:5,units:"ft"}},model:{},
  i18n:{localize:s=>s,format:s=>s},release:{...release,version:`${release.generation}.${release.build}`}};
globalThis.CONFIG={};
for(const [name,Class] of Object.entries(foundry.documents))if(name.startsWith("Base")&&Class.documentName){
  CONFIG[Class.documentName]={documentClass:Class,dataModels:{}};
  game.model[Class.documentName]=Object.fromEntries([
    ...Object.keys(manifest.documentTypes[Class.documentName]??{}),...(Class.metadata.coreTypes??[])
  ].map(t=>[t,{}]));
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const dir=path.join(root,"dist/pack-source/blackthorn-adventure");
const adv=JSON.parse(fs.readFileSync(path.join(dir,fs.readdirSync(dir).find(f=>f.endsWith(".json"))),"utf8"));
let errors=0;
for(const [type,docs] of [["Scene",adv.scenes],["Actor",adv.actors],["Item",adv.items],["JournalEntry",adv.journal],["Adventure",[adv]]]){
  let passed=0;
  for(const doc of docs)try{
    const model=new foundry.documents[`Base${type}`](doc,{strict:true});
    model.validate({strict:true});passed++;
  }catch(e){errors++;console.error(type,doc.name,e.message);}
  console.log(`${type}: ${passed}/${docs.length}`);
}
if(errors)process.exit(1);
