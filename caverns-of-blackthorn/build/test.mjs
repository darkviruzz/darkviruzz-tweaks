import test from "node:test";
import assert from "node:assert/strict";
import { budgetFor, rate, buildJournal } from "./lib/journal.mjs";
import { buildScene } from "./lib/scene.mjs";
import { buildActor } from "./lib/actors.mjs";
import fs from "node:fs";
import yaml from "js-yaml";
const creatures = yaml.load(fs.readFileSync(new URL("../src/creatures/blackthorn.yml",import.meta.url),"utf8"));
const gear = yaml.load(fs.readFileSync(new URL("../src/items/hort.yml",import.meta.url),"utf8"));

test("ground tokens ignore cave depth and retain relative climbing height", () => {
  const scene = buildScene({key:"depth",name:"Depth",cellPixels:120,widthCells:10,heightCells:10,elevation:-500,
    tokens:[{key:"guard",at:[[1,1]],elevation:-1000},{key:"guard",id:"climber",at:[[2,2]],heightAboveGround:15}]},
    {journals:[],bestiary:new Map([["guard",{id:"guard",name:"Guard"}]])});
  assert.deepEqual(scene.tokens.map(t=>t.elevation),[0,15]);
});

test("orc greataxe retains martial base weapon and one d12 damage", () => {
  const actor=buildActor(creatures.find(c=>c.key==="ork-krieger"));
  const axe=actor.items.find(i=>i.system.type.baseItem==="greataxe");
  assert.equal(axe.system.type.value,"martialM");
  assert.equal(axe.system.damage.base.number,1);
  assert.equal(axe.system.damage.base.denomination,12);
});

test("monster effects link to their own activity and have native durations", () => {
  for(const def of creatures){
    const actor=buildActor(def,gear);
    for(const source of def.actions??[]){
      if(!source.activeEffects?.length)continue;
      const item=actor.items.find(i=>i.name===source.name);
      assert.ok(item.effects.length);
      for(const activity of Object.values(item.system.activities))for(const ref of activity.effects){
        const effect=item.effects.find(e=>e._id===ref._id);
        assert.ok(effect);
        assert.equal(effect.transfer,false);
        assert.ok(effect.duration.value>0);
        assert.equal(effect.duration.units,"seconds");
      }
      if(source.name==="Unsichtbarkeit")assert.deepEqual(item.effects[0].statuses,["invisible"]);
      if(source.name==="Vergrößern")assert.ok(item.effects[0].system.changes.some(c=>c.key==="system.traits.size"&&c.value==="lg"));
    }
  }
});

test("Garghuk wears one attuned luckstone with checks and saves only", () => {
  const actor=buildActor(creatures.find(c=>c.key==="garghuk"),gear);
  const stones=actor.items.filter(i=>i.flags?.["caverns-of-blackthorn"]?.key==="stein-des-gluecks");
  assert.equal(stones.length,1);
  assert.equal(stones[0].system.attuned,true);
  assert.equal(stones[0].system.equipped,true);
  assert.deepEqual(stones[0].effects[0].system.changes.map(c=>c.key),["system.bonuses.abilities.check","system.bonuses.abilities.save"]);
});

test("trained skills explicitly retain their governing ability", () => {
  const actor = buildActor({key:"skill-check",name:"Skill check",cr:5,hp:{value:20},ac:12,
    abilities:{str:20,dex:12,con:14,int:14,wis:18,cha:16},
    skills:{ath:2,itm:1,rel:2,ins:2,ste:1}});
  const total = key => {
    const skill = actor.system.skills[key];
    return Math.floor((actor.system.abilities[skill.ability].value - 10) / 2) + skill.value * 3;
  };
  assert.deepEqual([total("ath"),total("itm"),total("rel"),total("ins"),total("ste")], [11,6,8,10,4]);
});

test("DMG budgets are ceilings, including the high-budget boundary", () => {
  const budget = budgetFor(7, 4);
  assert.deepEqual(budget, {low: 3000, moderate: 5200, high: 6800});
  for (const [xp, cls] of [[1250,"low"],[3000,"low"],[3001,"moderate"],[5200,"moderate"],[5201,"high"],[6800,"high"],[6801,"over"]]) {
    assert.equal(rate(xp, budget).cls, cls);
  }
  assert.deepEqual(budgetFor(7, 5), {low:3750,moderate:6500,high:8500});
});

test("scaling and rewards derive from the same creature XP", () => {
  const journal=buildJournal({key:"test",name:"Test",party:{level:7,size:4},pages:[{
    key:"room",name:"Room",encounters:[{name:"Guard",creatures:[{key:"guard",count:3}]}],
    scaling:{steps:[{for:"Harder",creatures:[{key:"guard",count:5}]}]}
  }]},{bestiary:new Map([["guard",{id:"abcdefghijklmnop",name:"Guard",cr:2,xp:450}]])});
  const html=journal.pages[0].text.content;
  assert.match(html,/1\.350 XP \(337,5 je SC\)/);
  assert.match(html,/2\.250 XP · 562,5 pro SC/);
});

test("shared map areas retain unique tokens and multiple working page pins", () => {
  const flag="caverns-of-blackthorn";
  const journals=[{_id:"journal",pages:[{_id:"page3",flags:{[flag]:{area:3}}},{_id:"page6",flags:{[flag]:{area:6}}}]}];
  const scene=buildScene({key:"shared",name:"Shared",cellPixels:120,widthCells:32,heightCells:33,
    tokens:[{key:"guard",area:3,at:[[1,1]]},{key:"guard",area:6,at:[[2,2]]}],
    notes:[{key:"pool",area:3,at:[1,1]},{key:"wall",area:3,at:[2,1]},{key:"camp",area:6,at:[2,2]}]
  },{journals,bestiary:new Map([["guard",{id:"actor",name:"Guard",size:1}]])});
  assert.equal(new Set(scene.tokens.map(t=>t._id)).size,2);
  assert.equal(new Set(scene.notes.map(t=>t._id)).size,3);
  assert.deepEqual(scene.notes.map(n=>n.pageId),["page3","page3","page6"]);
  assert.ok(scene.notes.every(n=>n.entryId==="journal"));
});
