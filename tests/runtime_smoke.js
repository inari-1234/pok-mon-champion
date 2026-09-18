const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
class FakeClassList{constructor(node){this.node=node;this.s=new Set((node.className||'').split(/\s+/).filter(Boolean));}add(...x){x.forEach(v=>this.s.add(v));this.node.className=[...this.s].join(' ')}remove(...x){x.forEach(v=>this.s.delete(v));this.node.className=[...this.s].join(' ')}}
class FakeNode{
 constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.listeners={};this.dataset={};this.style={};this.className='';this.classList=new FakeClassList(this);this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.files=[];this.checked=false;this.type='';this.alt='';this.src='';}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}
 emit(type,extra={}){const e={target:this,currentTarget:this,preventDefault(){},...extra};for(const fn of this.listeners[type]||[])fn(e);}
 append(...nodes){this.children.push(...nodes.filter(x=>x!=null))} appendChild(n){this.append(n);return n}
 replaceChildren(...nodes){this.children=[...nodes]}
 replaceWith(n){this.replacedWith=n}
 closest(){return null} focus(){} scrollIntoView(){} showModal(){this.open=true} close(){this.open=false}
 reset(){this.value='';}
}
const elements=Object.fromEntries(ids.map(id=>[id,new FakeNode('div',id)]));
for(const id of ['teamFormat','assistFormat','matchFormat']) elements[id].value='double';
elements.pokemonTypeFilter.value='all'; elements.confidence.value='3'; elements.planOutcome.value='unknown';
const document={
 getElementById:id=>elements[id]||null,
 createElement:tag=>new FakeNode(tag),
 createTextNode:text=>({nodeType:3,textContent:String(text)}),
 querySelectorAll:()=>[], querySelector:()=>null,
 addEventListener(){},
};
const store={'championCoach.v1':JSON.stringify({version:5,rank:'',team:{name:'旧データ',format:'double',members:['メガボーマンダ','ガオガエン'],favorite:'メガボーマンダ',plan:'',weak:''},matches:[],metaNotes:[]})}; const localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]};
const context={console,document,localStorage,location:{protocol:'file:'},navigator:{},crypto:{randomUUID:()=>`id-${Date.now()}`},Blob:function(){},URL:{createObjectURL:()=>'',revokeObjectURL(){}},alert(){},confirm:()=>true,setTimeout,clearTimeout};
context.window=context; context.globalThis=context; context.window.scrollTo=()=>{};
vm.createContext(context);
for(const f of ['pokemon-data.js','competitive-data.js','core.js','app.js']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context,{filename:f});
if(!context.PC_POKEMON_CATALOG||context.PC_POKEMON_CATALOG.length!==258)throw new Error('catalog init failed');
if(elements.teamMemberBuilder.children.length!==6)throw new Error('team slots not rendered');
if(!elements.teamMembers.value.includes('ボーマンダ')||elements.teamMembers.value.includes('メガボーマンダ'))throw new Error('v0.5 mega-label migration failed');
elements.pickTeamMember.emit('click');
let card=elements.pokemonCatalogGrid.children.find(x=>String(x.className).includes('pokemon-card')&&!x.disabled);
if(!card)throw new Error('picker card missing'); card.emit('click'); elements.pokemonPickerDone.emit('click');
if(!elements.teamMembers.value)throw new Error('favorite pick not reflected');
elements.autoCompleteTeam.emit('click');
const draft=elements.teamMembers.value.split(',').map(x=>x.trim()).filter(Boolean);if(draft.length!==6)throw new Error('auto complete did not reach six');
elements.teamForm.emit('submit');
let saved=JSON.parse(store['championCoach.v1']);if(saved.team.members.length!==6||!saved.team.favorite)throw new Error('team persistence failed');
if(elements.teamTrainingCards.children.length!==6)throw new Error('training cards not rendered');
const firstUnavailable=elements.teamMemberBuilder.children[0]?.children?.find?.(x=>String(x.className).includes('slot-actions'))?.children?.find?.(x=>x.textContent==='未');
if(!firstUnavailable)throw new Error('unowned action missing');
const removedName=saved.team.members[0];firstUnavailable.emit('click');saved=JSON.parse(store['championCoach.v1']);
if(!saved.inventory?.unowned?.length||saved.team.members.includes(removedName))throw new Error('unowned persistence/removal failed');
if(elements.assistOwnTeam.value.includes(removedName))throw new Error('saved analysis stayed stale after unowned removal');
const restoreButton=elements.teamInventory.children.flatMap(x=>x.children||[]).find(x=>x.textContent==='所持に戻す');if(!restoreButton)throw new Error('restore-owned action missing');restoreButton.emit('click');
saved=JSON.parse(store['championCoach.v1']);if(saved.inventory.unowned.length)throw new Error('restore-owned failed');
elements.pickAssistOpponent.emit('click');
for(let i=0;i<6;i++){
  const c=elements.pokemonCatalogGrid.children.find(x=>String(x.className).includes('pokemon-card')&&!String(x.className).includes('selected')&&!x.disabled);
  if(!c)throw new Error('not enough opponent cards'); c.emit('click');
}
elements.pokemonPickerDone.emit('click');
if(elements.assistOpponentTeam.value.split(',').filter(Boolean).length!==6)throw new Error('opponent picker failed');
elements.assistForm.emit('submit');
if(elements.assistResult.hidden)throw new Error('assist result did not render');
console.log('RUNTIME_SMOKE PASS',saved.team.favorite,saved.team.members.join(' / '));
