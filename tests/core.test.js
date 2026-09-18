const test=require('node:test');
const assert=require('node:assert/strict');
const catalog=require('../pokemon-data.js');
global.PC_POKEMON_CATALOG=catalog;
const C=require('../core.js');

const by=id=>catalog.find(p=>p.id===id);
test('catalog has 258 selectable M-C base/forms',()=>assert.equal(catalog.length,258));
test('catalog ids are unique',()=>assert.equal(new Set(catalog.map(x=>x.id)).size,258));
test('catalog every entry has Japanese name',()=>assert.ok(catalog.every(x=>x.name&&/[^\x00-\x7F]/.test(x.name))));
test('catalog every entry has one or two types',()=>assert.ok(catalog.every(x=>x.types.length>=1&&x.types.length<=2)));
test('catalog every entry has six positive base stats',()=>assert.ok(catalog.every(x=>x.stats.length===6&&x.stats.every(v=>v>0))));
test('current M-C Salamence present',()=>assert.equal(by('salamence').name,'ボーマンダ'));
test('current M-C Golisopod present',()=>assert.equal(by('golisopod').name,'グソクムシャ'));
test('current M-C Baxcalibur present',()=>assert.equal(by('baxcalibur').name,'セグレイブ'));
test('current M-C Rillaboom present',()=>assert.equal(by('rillaboom').name,'ゴリランダー'));
test('Gholdengo present',()=>assert.equal(by('gholdengo').name,'サーフゴー'));
test('regional form has distinct types',()=>assert.deepEqual(by('raichualola').types,['でんき','エスパー']));
test('mega-capable badge source exists',()=>assert.ok(by('salamence').mega>=1));
test('Charizard has two mega options',()=>assert.equal(by('charizard').mega,2));
test('find by Japanese name',()=>assert.equal(C.findCatalogPokemon('ボーマンダ').id,'salamence'));
test('find by English name',()=>assert.equal(C.findCatalogPokemon('Salamence').name,'ボーマンダ'));
test('find by internal id',()=>assert.equal(C.findCatalogPokemon('salamence').name,'ボーマンダ'));
test('old mega Japanese label migrates to base',()=>assert.equal(C.findCatalogPokemon('メガボーマンダ').name,'ボーマンダ'));
test('old Z mega Japanese label migrates to base',()=>assert.equal(C.findCatalogPokemon('メガガブリアスZ').name,'ガブリアス'));
test('old English mega label migrates to base',()=>assert.equal(C.findCatalogPokemon('Mega Salamence').name,'ボーマンダ'));
test('search partial Japanese',()=>assert.ok(C.catalogSearch('ボーマ').some(x=>x.id==='salamence')));
test('search English case-insensitive',()=>assert.ok(C.catalogSearch('SALAMENCE').some(x=>x.id==='salamence')));
test('search dex number',()=>assert.ok(C.catalogSearch('373').some(x=>x.id==='salamence')));
test('type filter limits results',()=>assert.ok(C.catalogSearch('', 'みず').every(x=>x.types.includes('みず'))));
test('type filter all keeps full catalog',()=>assert.equal(C.catalogSearch('', 'all').length,258));

test('ground is immune against Flying defender',()=>assert.equal(C.typeMultiplier('じめん',['ひこう']),0));
test('rock is 4x against fire/flying',()=>assert.equal(C.typeMultiplier('いわ',['ほのお','ひこう']),4));
test('electric is 4x against water/flying',()=>assert.equal(C.typeMultiplier('でんき',['みず','ひこう']),4));
test('dragon is immune against Fairy defender',()=>assert.equal(C.typeMultiplier('ドラゴン',['フェアリー']),0));
test('normal is immune against Ghost defender',()=>assert.equal(C.typeMultiplier('ノーマル',['ゴースト']),0));
test('fighting is immune against Ghost defender',()=>assert.equal(C.typeMultiplier('かくとう',['ゴースト']),0));

test('fast profile detects Dragapult',()=>assert.ok(C.catalogRoleProfile(by('dragapult'),'double').tags.includes('fast')));
test('physical profile detects Baxcalibur',()=>assert.ok(C.catalogRoleProfile(by('baxcalibur'),'double').tags.includes('physical')));
test('special profile detects Gholdengo',()=>assert.ok(C.catalogRoleProfile(by('gholdengo'),'double').tags.includes('special')));
test('bulky profile detects Toxapex',()=>assert.ok(C.catalogRoleProfile(by('toxapex'),'double').tags.includes('bulky')));
test('known role data augments catalog profile',()=>assert.ok(C.catalogRoleProfile(by('incineroar'),'double').known));

test('team pressure catches double rock weakness',()=>{const x=C.teamTypePressure(['リザードン','カイリュー']);assert.equal(x[0].type,'いわ');assert.equal(x[0].weak,2)});
test('candidate same exact member rejected',()=>assert.equal(C.scoreStarterCandidate(by('pikachu'),['ピカチュウ'],'double').score,-Infinity));
test('candidate same dex regional form rejected',()=>assert.equal(C.scoreStarterCandidate(by('raichualola'),['ライチュウ'],'double').score,-Infinity));
test('partner suggestions return requested count',()=>assert.equal(C.suggestPartners(['ピカチュウ'],'double',4).length,4));
test('partner suggestions never duplicate anchor dex',()=>assert.ok(C.suggestPartners(['ライチュウ'],'double',20).every(x=>x.pokemon.dex!==26)));
test('partner suggestion has reasons or role fallback data',()=>{const x=C.suggestPartners(['リザードン'],'double',1)[0];assert.ok(x.reasons.length||x.profile.style)});

for(const [i,anchor] of ['ピカチュウ','リザードン','ボーマンダ','グソクムシャ','セグレイブ','サーフゴー','ニンフィア','ガブリアス','ゴリランダー','ブリムオン'].entries()){
  test(`starter double ${i+1} builds six from ${anchor}`,()=>{const b=C.buildStarterTeam(anchor,'double');assert.equal(b.members.length,6);assert.equal(b.members[0],anchor);assert.equal(C.validateCatalogTeam(b.members).length,0);});
}
for(const [i,anchor] of ['ピカチュウ','リザードン','ボーマンダ','セグレイブ','ドラパルト'].entries()){
  test(`starter single ${i+1} builds six from ${anchor}`,()=>{const b=C.buildStarterTeam(anchor,'single');assert.equal(b.members.length,6);assert.equal(b.members[0],anchor);assert.equal(C.validateCatalogTeam(b.members).length,0);});
}

test('complete team preserves manually chosen members',()=>{const b=C.completeStarterTeam(['ピカチュウ','リザードン'],'double');assert.equal(b.members.length,6);assert.deepEqual(b.members.slice(0,2),['ピカチュウ','リザードン']);});
test('complete team removes same dex duplicate forms',()=>{const b=C.completeStarterTeam(['ライチュウ','ライチュウ（アローラのすがた）'],'double');assert.equal(b.members.filter(n=>C.findCatalogPokemon(n).dex===26).length,1);});
test('unknown anchor does not fabricate a team',()=>assert.equal(C.buildStarterTeam('存在しない','double').members.length,0));
test('validate rejects unknown Pokémon',()=>assert.ok(C.validateCatalogTeam(['存在しない']).length));
test('validate rejects seven members',()=>assert.ok(C.validateCatalogTeam(['ピカチュウ','リザードン','カメックス','フシギバナ','ガブリアス','ボーマンダ','セグレイブ']).length));
test('validate accepts a generated team',()=>assert.equal(C.validateCatalogTeam(C.buildStarterTeam('ピカチュウ','double').members).length,0));

// v0.4 core regressions
test('empty match stats are stable',()=>assert.equal(C.calculateStats([]).total,0));
test('validate match rejects missing result',()=>assert.ok(C.validateMatch({opponentTeam:['ピカチュウ'],selectedTeam:['リザードン'],format:'single',result:''}).length));
test('validate match rejects >6 opponents',()=>assert.ok(C.validateMatch({opponentTeam:['1','2','3','4','5','6','7'],selectedTeam:['a'],format:'single',result:'win'}).length));
test('validate single rejects >3 selected',()=>assert.ok(C.validateMatch({opponentTeam:['a'],selectedTeam:['1','2','3','4'],format:'single',result:'win'}).length));
test('validate double rejects >4 selected',()=>assert.ok(C.validateMatch({opponentTeam:['a'],selectedTeam:['1','2','3','4','5'],format:'double',result:'win'}).length));
test('foundation returns format',()=>assert.equal(C.buildTeamFoundation(['ガオガエン','サーフゴー','カイリュー','ブリムオン','ゴリランダー','ボーマンダ'],'double','').format,'double'));
test('foundation respects user plan',()=>assert.equal(C.buildTeamFoundation(['ガオガエン'],'double','自分の計画').plan,'自分の計画'));
test('progress at zero matches is foundation stage',()=>assert.equal(C.buildProgressSnapshot([],C.buildTeamFoundation([], 'double','')).stage,'foundation'));
test('beginner guide works with no personal notes',()=>assert.ok(C.buildBeginnerGuide(['ボーマンダ'],'double',[],[]).priorities.length));
test('selection assist keeps format',()=>assert.equal(C.buildSelectionAssist(['ボーマンダ'],['ガオガエン','サーフゴー','カイリュー','ブリムオン'],[],[],'double','').format,'double'));
test('opponent aggregation counts appearances',()=>assert.equal(C.aggregateOpponentPokemon([{date:'2026-09-18',result:'loss',opponentTeam:['ボーマンダ']}])[0].appearances,1));
test('own selection aggregation counts picks',()=>assert.equal(C.aggregateOwnSelections([{date:'2026-09-18',result:'win',selectedTeam:['ピカチュウ']}])[0].picks,1));
test('luck analysis remains classified',()=>assert.ok(C.analyzeMatch({result:'loss',cause:'luck',confidence:3,keyTurn:'急所',learning:'',selectionReason:''},[]).headline));

test('meta prior is format aware',()=>{assert.ok(C.getMetaPrior(by('rillaboom'),'double')>0);assert.ok(C.getMetaPrior(by('salamence'),'single')>0)});
test('meta prior version is current M-C dated',()=>assert.match(C.META_PRIOR_VERSION,/M-C.*2026-09/));
test('all 258 favorites can build a legal doubles starter team',()=>{for(const p of catalog){const b=C.buildStarterTeam(p.name,'double');assert.equal(b.members.length,6,p.name);assert.equal(b.members[0],p.name,p.name);assert.equal(C.validateCatalogTeam(b.members).length,0,p.name);}});
test('all 258 favorites can build a legal singles starter team',()=>{for(const p of catalog){const b=C.buildStarterTeam(p.name,'single');assert.equal(b.members.length,6,p.name);assert.equal(b.members[0],p.name,p.name);assert.equal(C.validateCatalogTeam(b.members).length,0,p.name);}});
test('starter team generation preserves species clause for all anchors',()=>{for(const p of catalog){const b=C.buildStarterTeam(p.name,'double');const dex=b.members.map(n=>C.findCatalogPokemon(n).dex);assert.equal(new Set(dex).size,dex.length,p.name);}});
test('male Basculegion keeps male form',()=>assert.equal(C.findCatalogPokemon('イダイトウ♂').id,'basculegion'));
test('female Basculegion keeps female form',()=>assert.equal(C.findCatalogPokemon('イダイトウ♀').id,'basculegionf'));
test('Indeedee female keeps female form',()=>assert.equal(C.findCatalogPokemon('イエッサン♀').id,'indeedeef'));

// v0.6 ownership / training regressions
const competitive=require('../competitive-data.js');
const competitiveById={};
for(const [key,value] of Object.entries(competitive)){const mon=C.findCatalogPokemon(key,catalog);if(mon)competitiveById[mon.id]=value;}

test('all stat-point starter spreads obey Champions 32-per-stat and 66-total rule',()=>{
  for(const p of catalog) for(const format of ['single','double']){
    const s=C.statPointSpread(p,format);
    assert.equal(s.total,66,`${p.name}/${format}`);
    assert.ok(Object.values(s.points).every(v=>Number.isInteger(v)&&v>=0&&v<=32),`${p.name}/${format}`);
    assert.ok(C.STARTER_NATURES.includes(s.nature),`${p.name}/${format}`);
  }
});
test('Incineroar support starter does not auto-force a speed-lowering nature',()=>assert.ok(!['ゆうかん','れいせい'].includes(C.statPointSpread(by('incineroar'),'double').nature)));
test('Hatterene trick-room starter may use Quiet nature',()=>assert.equal(C.statPointSpread(by('hatterene'),'double').nature,'れいせい'));
test('Kingambit low speed alone does not force Brave nature',()=>assert.equal(C.statPointSpread(by('kingambit'),'double').nature,'いじっぱり'));
test('normalizeUnowned accepts ids and names without duplicating',()=>{const s=C.normalizeUnowned(['rillaboom','ゴリランダー','ボーマンダ'],catalog);assert.equal(s.size,2);assert.ok(s.has('rillaboom')&&s.has('salamence'));});
test('partner suggestions exclude unowned Pokemon',()=>assert.ok(C.suggestPartners(['リザードン'],'double',20,catalog,['rillaboom','incineroar']).every(x=>!['rillaboom','incineroar'].includes(x.pokemon.id))));
test('auto-complete excludes all registered unowned Pokemon',()=>{const blocked=['rillaboom','incineroar','salamence','kingambit'];const b=C.buildStarterTeam('ピカチュウ','double',catalog,blocked);assert.equal(b.members.length,6);assert.ok(b.members.every(n=>!blocked.includes(C.findCatalogPokemon(n,catalog).id)));});
test('unowned favorite is not silently replaced',()=>{const b=C.buildStarterTeam('ゴリランダー','double',catalog,['rillaboom']);assert.equal(b.members.length,0);assert.match(b.warnings[0],/未所持/);});
test('replacement suggestions exclude the missing target and other unowned Pokemon',()=>{const r=C.suggestReplacements('ゴリランダー',['ゴリランダー','ガオガエン','ボーマンダ'],'double',8,catalog,['rillaboom','incineroar']);assert.ok(r.length);assert.ok(r.every(x=>!['rillaboom','incineroar'].includes(x.pokemon.id)&&x.pokemon.dex!==by('rillaboom').dex));});
test('replacement suggestions explain why a substitute was proposed',()=>{const r=C.suggestReplacements('ゴリランダー',['ゴリランダー','ガオガエン'],'double',1,catalog,['rillaboom']);assert.ok(r[0].reasons.length>0);});
test('bundled current M-C doubles data includes Rillaboom moves and items',()=>{const m=competitive.Rillaboom;assert.ok(m);assert.ok(m.moves.length>=4);assert.ok(m.items.length>=3);assert.equal(m.updatedAt,'2026-09-17');});
test('bundled competitive data never exposes unresolved numeric item labels',()=>{for(const m of Object.values(competitive))for(const x of m.items||[])assert.doesNotMatch(x.name,/^(道具|item)#?\d+/i);});
test('doubles starter set combines current meta with Champions stat points',()=>{const s=C.buildStarterTrainingSet(by('rillaboom'),'double',competitive.Rillaboom);assert.equal(s.statPointTotal,66);assert.ok(s.item);assert.equal(s.moves.length,4);assert.match(s.source,/Reg M-C/);});
test('singles starter does not borrow doubles moves when no singles meta is provided',()=>{const s=C.buildStarterTrainingSet(by('rillaboom'),'single',null);assert.equal(s.moves.length,0);assert.equal(s.statPointTotal,66);assert.ok(s.item);});
test('six-member doubles starter avoids held-item duplication when alternatives exist',()=>{const team=C.buildStarterTeam('ゴリランダー','double',catalog).members;const sets=C.buildTeamStarterSets(team,'double',competitiveById,catalog);const items=sets.map(x=>x.item).filter(Boolean);assert.equal(new Set(items).size,items.length);});
test('all generated doubles starter teams keep held items unique',()=>{for(const p of catalog){const team=C.buildStarterTeam(p.name,'double',catalog).members;const sets=C.buildTeamStarterSets(team,'double',competitiveById,catalog);const items=sets.map(x=>x.item).filter(Boolean);assert.equal(new Set(items).size,items.length,p.name);}});
test('custom Champions mega-stone labels are human-readable',()=>{assert.equal(C.CUSTOM_ITEM_LABELS[2645],'グソクムシャ用メガストーン');assert.doesNotMatch(C.CUSTOM_ITEM_LABELS[2648],/\d/);});
