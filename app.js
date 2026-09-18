(() => {
  'use strict';
  const C = window.PCCore;
  const STORAGE_KEY = 'championCoach.v1';
  const catalog = Array.isArray(window.PC_POKEMON_CATALOG) ? window.PC_POKEMON_CATALOG : [];
  const state = loadState();
  let lastAssist = null;
  let competitiveMeta = {};
  let competitiveMetaUpdatedAt = '';
  let singleCompetitiveMeta = {};
  let singleCompetitiveMetaUpdatedAt = '2026-09-18';
  const META_CACHE_KEY = 'championCoach.regmcMeta.v1';
  let teamDraft = [...(state.team.members || [])];
  let favoriteDraft = state.team.favorite || teamDraft[0] || '';
  let assistOpponentDraft = [];
  let logOpponentDraft = [];
  let selectedTeamDraft = [];
  let pickerContext = null;
  let replacementTarget = '';

  function defaultState() {
    return { version: 6, rank: '', team: { name: '', format: 'single', members: [], favorite: '', plan: '', weak: '' }, inventory: { unowned: [] }, matches: [], metaNotes: [] };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return sanitizeImported(parsed);
    } catch (_) { return defaultState(); }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function el(id) { return document.getElementById(id); }
  function text(node, value) { node.textContent = value; }
  function make(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function fmtPct(v) { return `${C.pct(v)}%`; }
  function causeLabel(v) { return C.CAUSE_LABELS[v] || '未分類'; }


  function resolveMon(value) { return C.findCatalogPokemon(value, catalog); }
  function normalizedMemberNames(values) {
    return C.uniqNames(values).map(v => resolveMon(v)?.name || v).slice(0, 6);
  }
  function spriteUrl(mon) {
    return mon && mon.dex > 0 ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${mon.dex}.png` : '';
  }
  function monImage(mon, className) {
    if (!mon) return make('div','sprite-fallback','?');
    const img=make('img',className || 'slot-img'); img.alt=mon.name; img.loading='lazy'; img.decoding='async'; img.src=spriteUrl(mon);
    img.addEventListener('error',()=>{const fallback=make('div','sprite-fallback',mon.name.slice(0,1));img.replaceWith(fallback);},{once:true});
    return img;
  }
  function syncShadow(id, values) { const node=el(id); if(node) node.value=C.uniqNames(values).join(', '); }
  function formatTypes(mon) { return mon ? mon.types.join(' / ') : 'データ未登録'; }

  function unownedIds() { return new Set(state.inventory?.unowned || []); }
  function isUnowned(monOrValue) { const mon=typeof monOrValue==='string'?resolveMon(monOrValue):monOrValue; return !!(mon && unownedIds().has(mon.id)); }
  function markUnowned(monOrValue) {
    const mon=typeof monOrValue==='string'?resolveMon(monOrValue):monOrValue; if(!mon) return;
    state.inventory ||= {unowned:[]};
    if(!state.inventory.unowned.includes(mon.id)) state.inventory.unowned.push(mon.id);
    replacementTarget=mon.name;
    teamDraft=teamDraft.filter(v=>resolveMon(v)?.id!==mon.id);
    state.team.members=(state.team.members||[]).filter(v=>resolveMon(v)?.id!==mon.id);
    if(state.team.favorite && resolveMon(state.team.favorite)?.id===mon.id) state.team.favorite=state.team.members[0]||'';
    if(favoriteDraft && resolveMon(favoriteDraft)?.id===mon.id) favoriteDraft=teamDraft[0]||'';
    saveState(); renderTeamDraft(); renderSavedTeamAnalysis(); renderOwnSelection();
    const advice=el('teamStarterAdvice'); if(advice){advice.hidden=false;advice.textContent=`${mon.name}を未所持として除外しました。下の候補は未所持を除いて更新されています。`;}
  }
  function restoreOwned(id) {
    state.inventory ||= {unowned:[]}; state.inventory.unowned=state.inventory.unowned.filter(v=>v!==id); if(resolveMon(replacementTarget)?.id===id) replacementTarget=''; saveState(); renderTeamDraft(); renderSavedTeamAnalysis();
  }

  function loadFallbackCompetitiveMeta() {
    const fallback=window.PC_COMPETITIVE_FALLBACK || {}; const out={};
    Object.entries(fallback).forEach(([en,meta])=>{const mon=resolveMon(en);if(mon)out[mon.id]=meta;});
    competitiveMeta=out; competitiveMetaUpdatedAt='2026-09-17';
    const singleFallback=window.PC_SINGLE_COMPETITIVE_FALLBACK || {}; const singleOut={};
    Object.entries(singleFallback).forEach(([en,meta])=>{const mon=resolveMon(en);if(mon)singleOut[mon.id]=meta;});
    singleCompetitiveMeta=singleOut;
    try { const cached=JSON.parse(localStorage.getItem(META_CACHE_KEY)||'null'); if(cached&&cached.data&&typeof cached.data==='object'){competitiveMeta={...competitiveMeta,...cached.data};competitiveMetaUpdatedAt=cached.updatedAt||competitiveMetaUpdatedAt;} } catch(_) {}
  }
  function parseNameCsv(csv) {
    const out={}; String(csv||'').split(/\r?\n/).slice(1).forEach(line=>{const p=line.split(',');if(p.length>=3&&(p[1]==='1'||p[1]==='11')&&!out[p[0]])out[p[0]]=p.slice(2).join(',');}); return out;
  }
  async function refreshCompetitiveMeta() {
    if(typeof fetch!=='function') return;
    try {
      const [battleRes,moveRes,itemRes]=await Promise.all([
        fetch('https://eurekaffeine.github.io/pokemon-champions-scraper/battle_meta.json',{cache:'no-store'}),
        fetch('https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/move_names.csv'),
        fetch('https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/item_names.csv')
      ]);
      if(!battleRes.ok||!moveRes.ok||!itemRes.ok) throw new Error('meta fetch failed');
      const [battle,moveCsv,itemCsv]=await Promise.all([battleRes.json(),moveRes.text(),itemRes.text()]);
      const moveNames=parseNameCsv(moveCsv), itemNames=parseNameCsv(itemCsv), out={...competitiveMeta};
      (battle.pokemon_usage||[]).forEach(row=>{
        const mon=resolveMon(row.name); if(!mon) return;
        const moves=(row.top_moves||[]).slice(0,6).map(v=>({name:moveNames[v.id]||'',usage:Number(v.usage)||0})).filter(v=>v.name);
        const items=(row.top_items||[]).slice(0,6).map(v=>({name:itemNames[v.id]||C.CUSTOM_ITEM_LABELS[v.id]||'',usage:Number(v.usage)||0})).filter(v=>v.name);
        out[mon.id]={usage:(Number(row.usage_rate)||0)*100,moves,items,updatedAt:battle.updated_at||''};
      });
      competitiveMeta=out; competitiveMetaUpdatedAt=String(battle.updated_at||'').slice(0,10)||competitiveMetaUpdatedAt;
      localStorage.setItem(META_CACHE_KEY,JSON.stringify({updatedAt:competitiveMetaUpdatedAt,data:competitiveMeta}));
      renderTeamBuilds();
    } catch(_) { /* bundled fallback remains active */ }
  }

  function renderMemberSlots(targetId, members, options={}) {
    const target=el(targetId); if(!target) return;
    const max=options.max || 6; const list=C.uniqNames(members).slice(0,max); target.replaceChildren();
    for(let i=0;i<max;i++){
      const value=list[i]; const slot=make('div',`team-slot${value?' filled':''}${value && options.favorite===value?' anchor':''}`);
      if(!value){slot.append(make('div','slot-empty',`${i+1}枠目`));target.append(slot);continue;}
      const mon=resolveMon(value); slot.append(monImage(mon));
      const body=make('div','slot-text'); body.append(make('div','slot-name',mon?.name || value),make('div','slot-types',formatTypes(mon)));
      if(options.favorite===value) body.append(make('span','slot-anchor','★ 軸'));
      slot.append(body);
      const actions=make('div','slot-actions');
      if(options.onFavorite){const fav=make('button','slot-action',options.favorite===value?'★':'☆');fav.type='button';fav.title='このポケモンを軸にする';fav.addEventListener('click',()=>options.onFavorite(value));actions.append(fav);}
      if(options.onUnowned){const no=make('button','slot-action inventory-action','未');no.type='button';no.title='持っていない';no.addEventListener('click',()=>options.onUnowned(value));actions.append(no);}
      if(options.onRemove){const rm=make('button','slot-action','×');rm.type='button';rm.title='外す';rm.addEventListener('click',()=>options.onRemove(value));actions.append(rm);}
      slot.append(actions); target.append(slot);
    }
  }

  function renderTeamDraft() {
    teamDraft=normalizedMemberNames(teamDraft);
    if(favoriteDraft && !teamDraft.includes(favoriteDraft)) favoriteDraft=teamDraft[0] || '';
    if(!favoriteDraft && teamDraft.length) favoriteDraft=teamDraft[0];
    syncShadow('teamMembers',teamDraft); text(el('teamMemberCount'),`${teamDraft.length}/6`);
    renderMemberSlots('teamMemberBuilder',teamDraft,{max:6,favorite:favoriteDraft,onFavorite:value=>{favoriteDraft=value;renderTeamDraft();},onUnowned:value=>markUnowned(value),onRemove:value=>{teamDraft=teamDraft.filter(v=>v!==value);if(favoriteDraft===value)favoriteDraft=teamDraft[0]||'';renderTeamDraft();}});
    const advice=el('teamStarterAdvice');
    if(!teamDraft.length){advice.hidden=true;advice.textContent='';}
    else {advice.hidden=false;advice.textContent=teamDraft.length===1?`「${favoriteDraft || teamDraft[0]}」を軸にしました。残り5体は自分で選んでも、おまかせで仮組みしても構いません。`:`${favoriteDraft || teamDraft[0]}を軸に、現在${teamDraft.length}体です。候補は弱点と役割の偏りを減らす順で表示します。`;}
    renderPartnerSuggestions();
  }

  function renderPartnerSuggestions() {
    const box=el('teamPartnerSuggestions'); if(!box) return; box.replaceChildren();
    if(!teamDraft.length || teamDraft.length>=6) return;
    const format=el('teamFormat')?.value || state.team.format;
    const suggestions=replacementTarget ? C.suggestReplacements(replacementTarget,teamDraft,format,4,catalog,[...unownedIds()]) : C.suggestPartners(teamDraft,format,4,catalog,[...unownedIds()]);
    if(replacementTarget) box.append(make('div','replacement-banner',`${replacementTarget}の代替候補：役割の近さと現在の構築補完を合わせて表示しています。`));
    suggestions.forEach(s=>{
      const card=make('article','partner-card');card.append(monImage(s.pokemon,'slot-img'));
      const body=make('div'); body.append(make('strong','',s.pokemon.name));
      const reason=s.reasons.length?s.reasons.join(' / '):C.catalogRoleProfile(s.pokemon,el('teamFormat')?.value || state.team.format).style;
      body.append(make('small','',`${s.pokemon.types.join('/')} ・ ${reason}`)); card.append(body);
      const actions=make('div','partner-actions');
      const b=make('button','',`候補に追加`);b.type='button';b.addEventListener('click',()=>{if(teamDraft.length<6){teamDraft.push(s.pokemon.name);replacementTarget='';renderTeamDraft();}});
      const no=make('button','ghost-btn','持っていない');no.type='button';no.addEventListener('click',()=>markUnowned(s.pokemon));actions.append(b,no);card.append(actions);box.append(card);
    });
  }

  function renderOpponentDraft(kind) {
    const isAssist=kind==='assist'; const draft=isAssist?assistOpponentDraft:logOpponentDraft;
    syncShadow(isAssist?'assistOpponentTeam':'opponentTeam',draft);
    text(el(isAssist?'assistOpponentCount':'logOpponentCount'),`${draft.length}/6`);
    renderMemberSlots(isAssist?'assistOpponentBuilder':'logOpponentBuilder',draft,{max:6,onRemove:value=>{if(isAssist)assistOpponentDraft=assistOpponentDraft.filter(v=>v!==value);else logOpponentDraft=logOpponentDraft.filter(v=>v!==value);renderOpponentDraft(kind);}});
  }

  function renderOwnSelection() {
    const box=el('selectedTeamPicker'); if(!box) return; box.replaceChildren();
    const max=el('matchFormat')?.value==='single'?3:4;
    selectedTeamDraft=C.uniqNames(selectedTeamDraft).filter(v=>state.team.members.includes(v)).slice(0,max);
    syncShadow('selectedTeam',selectedTeamDraft); text(el('selectedTeamCount'),`${selectedTeamDraft.length}/${max}体選出`);
    if(!state.team.members.length){box.append(make('div','empty','先に構築を登録すると、ここはタップ選択になります。'));return;}
    state.team.members.forEach(value=>{const b=make('button',`own-pick-btn${selectedTeamDraft.includes(value)?' selected':''}`,value);b.type='button';b.addEventListener('click',()=>{if(selectedTeamDraft.includes(value))selectedTeamDraft=selectedTeamDraft.filter(v=>v!==value);else if(selectedTeamDraft.length<max)selectedTeamDraft.push(value);renderOwnSelection();});box.append(b);});
  }

  let pickerVisibleLimit=48;
  function openPokemonPicker(kind) {
    const configs={
      team:{title:'構築に入れるポケモン',help:'最初の1体は「好き」で選んで大丈夫です。フォーム違いは同じ種族として重複できません。',max:6,selected:teamDraft},
      assist:{title:'相手のポケモン',help:'名前を知らなくても、画像とタイプを見て6体まで選べます。',max:6,selected:assistOpponentDraft},
      log:{title:'相手のポケモン',help:'対戦画面を見ながら6体をタップしてください。',max:6,selected:logOpponentDraft},
      meta:{title:'環境メモのポケモン',help:'画像から1体選ぶと名前を自動入力します。',max:1,selected:C.uniqNames(el('metaPokemon').value)}
    };
    const c=configs[kind]; if(!c) return;
    pickerContext={kind,max:c.max,selected:normalizedMemberNames(c.selected)}; pickerVisibleLimit=48;
    text(el('pokemonPickerTitle'),c.title);text(el('pokemonPickerHelp'),c.help);el('pokemonSearch').value='';el('pokemonTypeFilter').value='all';
    renderPokemonCatalog();el('pokemonPickerDialog').showModal();
  }

  function renderPokemonCatalog() {
    if(!pickerContext) return;
    const pickerFormat=pickerContext.kind==='team'?(el('teamFormat').value||state.team.format):pickerContext.kind==='assist'?(el('assistFormat').value||state.team.format):pickerContext.kind==='log'?(el('matchFormat').value||state.team.format):state.team.format;
    const query=el('pokemonSearch').value; const type=el('pokemonTypeFilter').value;
    const results=C.catalogSearch(query,type,catalog).sort((a,b)=>a.dex-b.dex || a.name.localeCompare(b.name,'ja'));
    const box=el('pokemonCatalogGrid');box.replaceChildren();
    const selectedMons=pickerContext.selected.map(resolveMon).filter(Boolean); const selectedDex=new Set(selectedMons.map(p=>p.dex));
    results.slice(0,pickerVisibleLimit).forEach(mon=>{
      const selected=pickerContext.selected.includes(mon.name); const sameSpecies=selectedDex.has(mon.dex)&&!selected; const unavailable=pickerContext.kind==='team'&&isUnowned(mon);
      const card=make('button',`pokemon-card${selected?' selected':''}${sameSpecies||unavailable?' disabled':''}`);card.type='button';card.disabled=sameSpecies||unavailable;
      card.append(monImage(mon,'pokemon-card-img'),make('div','pokemon-card-name',mon.name));
      const meta=make('div','pokemon-card-meta',mon.types.join(' / ')); if(mon.mega) meta.append(make('span','mega-badge',mon.mega>1?`メガ${mon.mega}種`:'メガ可')); card.append(meta);
      const role=C.catalogRoleProfile(mon,pickerFormat).style; card.append(make('div','pokemon-card-meta',role));
      if(C.getMetaPrior(mon,pickerFormat)>=7) card.append(make('div','pokemon-card-meta','大会でよく見る'));
      if(unavailable) card.append(make('div','pokemon-card-meta unavailable-label','未所持'));
      if(selected) card.append(make('span','pokemon-card-check','✓'));
      card.addEventListener('click',()=>{
        if(selected) pickerContext.selected=pickerContext.selected.filter(v=>v!==mon.name);
        else if(pickerContext.selected.length<pickerContext.max) pickerContext.selected.push(mon.name);
        else if(pickerContext.max===1) pickerContext.selected=[mon.name];
        renderPokemonCatalog();
      });box.append(card);
    });
    if(results.length>pickerVisibleLimit){const more=make('button','secondary-btn',`さらに表示（残り${results.length-pickerVisibleLimit}）`);more.type='button';more.addEventListener('click',()=>{pickerVisibleLimit+=48;renderPokemonCatalog();});box.append(more);}
    text(el('pokemonPickerSelected'),`${pickerContext.selected.length}/${pickerContext.max} 選択`);text(el('pokemonCatalogCount'),`${results.length}件中 ${Math.min(results.length,pickerVisibleLimit)}件表示`);
  }

  function commitPokemonPicker() {
    if(!pickerContext) return; const picked=normalizedMemberNames(pickerContext.selected);
    if(pickerContext.kind==='team'){teamDraft=picked;if(!favoriteDraft||!teamDraft.includes(favoriteDraft))favoriteDraft=teamDraft[0]||'';renderTeamDraft();}
    else if(pickerContext.kind==='assist'){assistOpponentDraft=picked;renderOpponentDraft('assist');}
    else if(pickerContext.kind==='log'){logOpponentDraft=picked;renderOpponentDraft('log');}
    else if(pickerContext.kind==='meta'){el('metaPokemon').value=picked[0]||'';}
    pickerContext=null;el('pokemonPickerDialog').close();
  }

  function navigate(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
    el(`screen-${name}`).classList.add('active');
    const nav = el(`nav-${name}`); if (nav) nav.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function sanitizeImported(data) {
    const clean = defaultState();
    if (!data || typeof data !== 'object' || !Array.isArray(data.matches)) throw new Error('invalid');
    clean.rank = typeof data.rank === 'string' ? data.rank.slice(0, 80) : '';
    const team = data.team && typeof data.team === 'object' ? data.team : {};
    const normalizedTeam=[]; const seenDex=new Set();
    C.uniqNames(team.members).forEach(v=>{const mon=C.findCatalogPokemon(v,catalog);if(mon && normalizedTeam.length<6 && !seenDex.has(mon.dex)){normalizedTeam.push(mon.name);seenDex.add(mon.dex);}});
    const rawFavorite=typeof team.favorite === 'string' ? C.findCatalogPokemon(team.favorite,catalog)?.name : '';
    clean.team = {
      name: typeof team.name === 'string' ? team.name.slice(0, 120) : '',
      format: team.format === 'double' ? 'double' : 'single',
      members: normalizedTeam,
      favorite: rawFavorite && normalizedTeam.includes(rawFavorite) ? rawFavorite : (normalizedTeam[0] || ''),
      plan: typeof team.plan === 'string' ? team.plan.slice(0, 3000) : '',
      weak: typeof team.weak === 'string' ? team.weak.slice(0, 3000) : ''
    };
    const inv = data.inventory && typeof data.inventory === 'object' ? data.inventory : {};
    clean.inventory = { unowned: [...C.normalizeUnowned(Array.isArray(inv.unowned) ? inv.unowned : [], catalog)].slice(0, 258) };
    if(clean.inventory.unowned.length){
      const blocked=new Set(clean.inventory.unowned);
      clean.team.members=clean.team.members.filter(v=>{const mon=C.findCatalogPokemon(v,catalog);return mon && !blocked.has(mon.id);});
      if(!clean.team.members.includes(clean.team.favorite)) clean.team.favorite=clean.team.members[0]||'';
    }
    clean.matches = data.matches.slice(0, 5000).map((m, i) => ({
      id: typeof m.id === 'string' ? m.id : `import-${Date.now()}-${i}`,
      date: typeof m.date === 'string' ? m.date.slice(0, 20) : '',
      format: m.format === 'single' ? 'single' : 'double',
      opponentTeam: C.uniqNames(m.opponentTeam).slice(0, 12),
      selectedTeam: C.uniqNames(m.selectedTeam).slice(0, 12),
      result: ['win','loss'].includes(m.result) ? m.result : '',
      cause: C.CAUSE_LABELS[m.cause] ? m.cause : 'unknown',
      selectionReason: typeof m.selectionReason === 'string' ? m.selectionReason.slice(0, 3000) : '',
      planOutcome: ['held','partial','broken','unknown'].includes(m.planOutcome) ? m.planOutcome : 'unknown',
      keyTurn: typeof m.keyTurn === 'string' ? m.keyTurn.slice(0, 3000) : '',
      confidence: Math.max(1, Math.min(5, Number(m.confidence) || 3)),
      learning: typeof m.learning === 'string' ? m.learning.slice(0, 3000) : '',
      createdAt: typeof m.createdAt === 'string' ? m.createdAt : ''
    })).filter(m => !C.validateMatch(m).length);
    clean.metaNotes = Array.isArray(data.metaNotes) ? data.metaNotes.slice(0, 1000).map((n,i) => ({
      id: n.id || `note-${i}`,
      pokemon: typeof n.pokemon === 'string' ? n.pokemon.slice(0, 120) : '',
      risk: ['high','mid','low'].includes(n.risk) ? n.risk : 'mid',
      role: typeof n.role === 'string' ? n.role.slice(0, 300) : '',
      watch: typeof n.watch === 'string' ? n.watch.slice(0, 3000) : '',
      answer: typeof n.answer === 'string' ? n.answer.slice(0, 3000) : ''
    })).filter(n => n.pokemon) : [];
    return clean;
  }

  function renderDashboard() {
    const s = C.calculateStats(state.matches);
    text(el('rankChip'), `RANK ${state.rank || '未設定'}`);
    text(el('statTotal'), s.total);
    text(el('statWinRate'), s.total ? fmtPct(s.winRate) : '—');
    text(el('statRecent'), s.recentCount ? fmtPct(s.recentWinRate) : '—');
    text(el('statStreak'), s.streak ? `${s.streak}${s.streakResult === 'win' ? '連勝' : '連敗'}` : '—');

    const foundation = C.buildTeamFoundation(state.team.members, state.team.format, state.team.plan);
    renderHomeFoundation(foundation);
    renderProgress(C.buildProgressSnapshot(state.matches, foundation));
    renderThreats(el('homeThreats'), 3);
    const quick=el('quickStartButton');
    if(quick){const ready=state.team.members.length>=3;quick.dataset.nav=ready?'assist':'team';text(quick,ready?'対戦準備を始める':'好きな1体を選んで始める');}
  }

  function foundationBadge(foundation) {
    if (!foundation.members.length) return {cls:'mid',text:'未登録'};
    const coverage=Math.round(foundation.coverage*100);
    return coverage>=80?{cls:'low',text:`土台 ${coverage}%`}:coverage>=50?{cls:'mid',text:`土台 ${coverage}%`}:{cls:'high',text:`土台 ${coverage}%`};
  }

  function renderPicks(target, picks, sourceLabel) {
    target.replaceChildren();
    if (!picks?.length) { target.append(make('div','empty','役割判定の確信が足りないため、基本選出はまだ固定しません。')); return; }
    if (sourceLabel) target.append(make('div','assist-label',sourceLabel));
    const row=make('div','pick-chips');
    picks.forEach(v=>row.append(make('span','pick-chip supported',v)));
    target.append(row);
  }

  function renderFoundationPicks(target, foundation) {
    target.replaceChildren();
    if (!foundation?.basicSelection?.length) { target.append(make('div','empty','役割判定の確信が足りないため、基本選出はまだ固定しません。')); return; }
    const leadLabel=foundation.format==='single'?'先発候補':'先発2体';
    const backLabel=foundation.format==='single'?'残り2体':'後発2体';
    const leadWrap=make('div','foundation-pick-line'); leadWrap.append(make('span','assist-label',leadLabel));
    const leadRow=make('div','pick-chips'); foundation.basicLead.forEach(v=>leadRow.append(make('span','pick-chip supported',v))); leadWrap.append(leadRow);
    const backWrap=make('div','foundation-pick-line'); backWrap.append(make('span','assist-label',backLabel));
    const backRow=make('div','pick-chips'); foundation.basicBack.forEach(v=>backRow.append(make('span','pick-chip supported',v))); backWrap.append(backRow);
    target.append(leadWrap,backWrap);
  }

  function teamPlanForFormat(format) {
    return (state.team.format || 'single') === (format === 'single' ? 'single' : 'double') ? state.team.plan : '';
  }

  function renderHomeFoundation(foundation) {
    const badge=foundationBadge(foundation);
    const b=el('homeFoundationBadge'); b.className=`tag ${badge.cls}`; text(b,badge.text);
    text(el('homeFoundationPlan'), foundation.members.length ? foundation.plan : '構築6体を登録すると、役割から基本戦術の仮説を作ります。');
    renderFoundationPicks(el('homeFoundationPicks'), foundation);
    const gaps=el('homeFoundationGaps'); gaps.replaceChildren();
    if (!foundation.members.length) gaps.append(make('div','empty','対戦ログを待たず、まず構築画面から6体を登録してください。'));
    else if (!foundation.gaps.length) gaps.append(make('div','foundation-good','初期モデル上、大きな役割抜けは検出していません。実際の技・持ち物で確認してください。'));
    else foundation.gaps.slice(0,2).forEach(v=>gaps.append(make('div','foundation-gap',v)));
  }

  function renderProgress(progress) {
    text(el('progressStage'), progress.stageLabel);
    const badge=el('progressStage'); badge.className=`tag ${progress.stage==='personalize'?'low':progress.stage==='diagnose'?'mid':'mid'}`;
    text(el('progressMessage'),progress.message);
    text(el('progressNext'),progress.nextFocus);
    const box=el('progressMetrics'); box.replaceChildren();
    const items=[];
    if (!progress.total) items.push(['対戦数','0戦','まず土台を試す']);
    else {
      items.push(['事前プラン',progress.prepRate==null?'—':fmtPct(progress.prepRate),`直近${progress.recentCount}戦`]);
      items.push(['振り返り',progress.reviewRate==null?'—':fmtPct(progress.reviewRate),'重要場面/学び']);
      items.push(['プラン維持',progress.planExecutionRate==null?'—':fmtPct(progress.planExecutionRate),progress.planOutcomeCount?`${progress.planOutcomeCount}戦記録`:'未記録']);
    }
    items.forEach(([label,value,small])=>{const card=make('div','progress-metric');card.append(make('span','',label),make('strong','',value),make('small','',small));box.append(card);});
  }

  function renderThreats(target, limit) {
    target.replaceChildren();
    const rows = C.aggregateOpponentPokemon(state.matches).slice(0, limit || 100);
    if (!rows.length) { target.append(make('div', 'empty', '対戦を記録すると、遭遇頻度と敗戦率から要警戒ポケモンを抽出します。')); return; }
    rows.forEach(r => {
      const row = make('div', 'threat-row');
      const left = make('div');
      left.append(make('div', 'threat-name', r.name), make('div', 'threat-meta', `${r.appearances}回遭遇 ・ 対戦勝率 ${fmtPct(r.winRate)} ・ 直近10戦で${r.recent}回`));
      const meter = make('div', 'meter'); const bar = make('span'); bar.style.width = `${Math.round(r.dangerScore * 100)}%`; meter.append(bar); left.append(meter);
      const score = make('div', 'score'); score.append(make('strong', '', Math.round(r.dangerScore * 100)), make('span', 'threat-meta', '警戒度'));
      row.append(left, score); target.append(row);
    });
  }

  function renderHistory() {
    const box = el('matchHistory'); box.replaceChildren();
    const list = [...state.matches].sort((a,b) => Date.parse(b.date)-Date.parse(a.date)).slice(0, 12);
    if (!list.length) { box.append(make('div','empty','まだ対戦ログがありません。最初は詳細に書かず、相手・選出・勝敗だけでも十分です。')); return; }
    list.forEach(m => {
      const card = make('article','history-card');
      const top = make('div','history-top');
      top.append(make('h3','',`${m.date || '日付なし'} ・ ${m.format === 'single' ? 'シングル' : 'ダブル'}`), make('span',`result ${m.result}`,m.result==='win'?'WIN':'LOSS'));
      const opp = C.uniqNames(m.opponentTeam).join(' / ');
      const selected = C.uniqNames(m.selectedTeam).join(' / ');
      card.append(top, make('p','',`相手: ${opp}`), make('p','',`選出: ${selected}`));
      if (m.selectionReason) card.append(make('p','',`事前プラン: ${m.selectionReason}`));
      if (m.result==='loss') card.append(make('p','',`敗因仮説: ${causeLabel(m.cause)}`));
      box.append(card);
    });
  }

  function renderMetaNotes() {
    const box = el('metaNotes'); box.replaceChildren();
    if (!state.metaNotes.length) { box.append(make('div','empty','「分からなかったもの」から登録してください。全部の型を覚える必要はありません。')); return; }
    [...state.metaNotes].reverse().forEach(note => {
      const card = make('article','meta-card');
      const h = make('h3'); h.append(make('span',`tag ${note.risk}`,note.risk==='high'?'高警戒':note.risk==='mid'?'中警戒':'低警戒'), document.createTextNode(` ${note.pokemon}`));
      card.append(h);
      if(note.role) card.append(make('p','',`分類: ${note.role}`));
      if(note.watch) card.append(make('p','',`警戒: ${note.watch}`));
      if(note.answer) card.append(make('p','',`自分の回答: ${note.answer}`));
      box.append(card);
    });
  }

  function renderInventory() {
    const box=el('teamInventory'); if(!box) return; box.replaceChildren();
    const ids=[...(state.inventory?.unowned||[])]; text(el('teamInventoryCount'),`${ids.length}体`);
    if(!ids.length){box.append(make('span','small muted','未所持登録はありません。'));return;}
    ids.forEach(id=>{const mon=catalog.find(p=>p.id===id);if(!mon)return;const chip=make('span','inventory-chip');chip.append(make('span','',mon.name));const b=make('button','','所持に戻す');b.type='button';b.addEventListener('click',()=>restoreOwned(id));chip.append(b);box.append(chip);});
  }

  function renderTeamBuilds() {
    const box=el('teamTrainingCards'); if(!box) return; box.replaceChildren();
    text(el('teamTrainingMeta'),state.team.format==='single'?(singleCompetitiveMetaUpdatedAt?`M-C シングル ${singleCompetitiveMetaUpdatedAt}`:'M-C シングル 内蔵'):(competitiveMetaUpdatedAt?`M-C ダブル ${competitiveMetaUpdatedAt}`:'M-C ダブル 内蔵'));
    if(!(state.team.members||[]).length){box.append(make('div','empty','構築を保存すると、6体それぞれのスターター型を表示します。'));return;}
    const metaMap=state.team.format==='single'?singleCompetitiveMeta:competitiveMeta;
    const sets=C.buildTeamStarterSets(state.team.members,state.team.format,metaMap,catalog);
    sets.forEach(set=>{
      const mon=resolveMon(set.pokemon); const card=make('article','training-card');
      const head=make('div','training-head'),title=make('div','training-title');title.append(monImage(mon,'slot-img'));const titleText=make('div');titleText.append(make('strong','',set.pokemon),make('div','small muted',`${formatTypes(mon)} ・ ${set.dataStrength}`));title.append(titleText);head.append(title);
      const no=make('button','ghost-btn','未所持');no.type='button';no.addEventListener('click',()=>markUnowned(mon));head.append(no);card.append(head);
      const item=make('div','training-section');item.append(make('span','training-label','持ち物'));item.append(make('div','item-main',set.item||'候補を確認中'));
      if(set.itemAdjustedForClause)item.append(make('div','training-note','構築内の持ち物重複を避けるため、次候補へ変更しました。'));
      if(set.itemAlternatives.length)item.append(make('div','item-alt',`代替: ${set.itemAlternatives.join(' / ')}`));card.append(item);
      const nature=make('div','training-section');nature.append(make('span','training-label','性格'),make('strong','',set.nature));card.append(nature);
      const stat=make('div','training-section');stat.append(make('span','training-label',`能力ポイント（合計 ${set.statPointTotal}）`));const chips=make('div','stat-point-list');Object.entries(set.statPoints).filter(([,v])=>v>0).forEach(([k,v])=>chips.append(make('span','stat-point-chip',`${k} ${v}`)));stat.append(chips,make('div','training-note',set.statExplanation));card.append(stat);
      const moves=make('div','training-section');moves.append(make('span','training-label','技候補'));if(set.moves.length){const ul=make('ul','move-list');set.moves.forEach(m=>ul.append(make('li','',m.name)));moves.append(ul);}else moves.append(make('div','training-note','現行M-Cの実戦サンプルが不足しているため、技は断定していません。ゲーム内の習得技を確認してください。'));card.append(moves);
      card.append(make('div','training-note',`${set.source}${set.usage?` ・ 使用率目安 ${set.usage.toFixed(1)}%`:''}`));box.append(card);
    });
  }

  function renderSavedTeamAnalysis() {
    el('assistOwnTeam').value = (state.team.members || []).join(' / ');
    if (!lastAssist) el('assistFormat').value = state.team.format || 'single';
    const foundation=C.buildTeamFoundation(state.team.members,state.team.format,state.team.plan);
    const badge=foundationBadge(foundation); const foundationBadgeNode=el('teamFoundationBadge');
    foundationBadgeNode.className=`tag ${badge.cls}`; text(foundationBadgeNode,badge.text);
    text(el('teamFoundationPlan'),foundation.plan);
    el('adoptFoundationPlan').hidden = !foundation.members.length || foundation.planSource==='user';
    renderFoundationPicks(el('teamFoundationPicks'),foundation);
    const roles=el('teamFoundationRoles'); roles.replaceChildren();
    if(!foundation.members.length) roles.append(make('div','empty','6体を登録すると、一般的な役割から土台を生成します。'));
    foundation.profiles.forEach(p=>{const card=make('div',`role-card ${p.known?'known':'unknown'}`);card.append(make('strong','',p.name));card.append(make('span','',p.known?(p.labels.join(' / ')||'役割確認済み'):'初期モデル未登録'));roles.append(card);});
    const strengths=el('teamFoundationStrengths'); strengths.replaceChildren();
    (foundation.strengths.length?foundation.strengths:['初期モデルで確認できる強みはまだありません。']).forEach(v=>strengths.append(make('div',foundation.strengths.length?'foundation-good':'empty',v)));
    const gaps=el('teamFoundationGaps'); gaps.replaceChildren();
    (foundation.gaps.length?foundation.gaps:['初期モデル上、大きな役割抜けは検出していません。']).forEach(v=>gaps.append(make('div',foundation.gaps.length?'foundation-gap':'foundation-good',v)));
    renderInventory(); renderTeamBuilds();
  }

  function renderTeam() {
    teamDraft=[...(state.team.members || [])]; favoriteDraft=state.team.favorite || teamDraft[0] || '';
    el('teamName').value = state.team.name || '';
    el('teamFormat').value = state.team.format || 'single';
    syncShadow('teamMembers',teamDraft);
    renderTeamDraft();
    el('teamPlan').value = state.team.plan || '';
    el('teamWeak').value = state.team.weak || '';
    renderSavedTeamAnalysis();

    const box = el('selectionStats'); box.replaceChildren();
    const rows = C.aggregateOwnSelections(state.matches);
    if(!rows.length){ box.append(make('div','empty','対戦ログが増えると、各ポケモンの選出回数と選出時勝率を表示します。初期は上の基本戦術を使ってください。')); return; }
    rows.forEach(r => {
      const row=make('div','threat-row');
      const left=make('div'); left.append(make('div','threat-name',r.name),make('div','threat-meta',`${r.picks}回選出 ・ ${r.wins}勝${r.losses}敗`));
      const right=make('div','score'); right.append(make('strong','',fmtPct(r.winRate)),make('span','threat-meta','選出時勝率'));
      row.append(left,right); box.append(row);
    });
  }


  function evidenceLabel(level) {
    return level === 'high' ? '根拠 高' : level === 'mid' ? '根拠 中' : level === 'low' ? '根拠 少' : '根拠なし';
  }

  function renderAssist(assist) {
    lastAssist = assist;
    const panels = ['assistFocusPanel','assistResult','assistThreatPanel','assistCandidatesPanel','assistFailuresPanel'];
    panels.forEach(id => { el(id).hidden = false; });

    const guide = assist.beginnerGuide;
    const coverage = Math.round((guide?.coverage || 0) * 100);
    const coverageBadge = el('assistGuideCoverage');
    coverageBadge.className = `tag ${coverage >= 80 ? 'low' : coverage >= 50 ? 'mid' : 'high'}`;
    text(coverageBadge, `基本ガイド ${coverage}%`);
    text(el('assistFocusSummary'), guide?.priorities?.length
      ? '上から順に確認してください。全部の型を覚える必要はなく、この対戦で起こりやすい崩れ方だけを先に見ます。'
      : '相手を入力すると、基本ガイドと自分の履歴から優先して見る点を整理します。');

    const focusList = el('assistFocusList'); focusList.replaceChildren();
    if (!guide?.priorities?.length) {
      focusList.append(make('div','empty','相手のポケモンを入力してください。'));
    } else {
      guide.priorities.forEach((r, i) => {
        const card = make('article',`focus-card ${r.known ? 'known' : 'unknown'}`);
        const head = make('div','focus-head');
        const left = make('div'); left.append(make('span','focus-rank',`${i+1}`), make('h3','',r.name));
        head.append(left, make('span',`tag ${r.known ? 'low' : 'mid'}`,r.known ? '基本ガイドあり' : '基本ガイド外'));
        card.append(head, make('p','focus-role',r.role), make('p','',r.focus));
        if (r.watch.length) {
          const ul = make('ul','focus-watch');
          r.watch.forEach(v => { const li=make('li','',v); ul.append(li); });
          card.append(ul);
        }
        if (r.appearances) card.append(make('p','personal-line',`自分の履歴: ${r.appearances}回遭遇・敗戦率 ${fmtPct(r.lossRate)}`));
        if (r.noteAnswer) card.append(make('p','answer-line',`登録済みの自分の回答: ${r.noteAnswer}`));
        focusList.append(card);
      });
    }

    const principles = el('assistPrinciples'); principles.replaceChildren();
    if (guide?.principles?.length) {
      principles.append(make('div','assist-label','この並びで特に確認する展開'));
      guide.principles.forEach(p => {
        const row = make('div','principle-row');
        row.append(make('span','tag mid',p.label), make('p','',p.text)); principles.append(row);
      });
    }
    text(el('assistUnknowns'), guide?.unknown?.length
      ? `基本ガイド未登録: ${guide.unknown.join(' / ')}。この相手は過去ログ・自分のメモがある場合だけ個別補正します。`
      : `基本ガイド: ${guide?.version || C.BASE_KNOWLEDGE_VERSION}`);

    const recommended = el('assistRecommended'); recommended.replaceChildren();
    if (assist.recommended.length) {
      const label = assist.recommendationSource === 'starter' ? `${assist.format === 'single' ? '3体' : '4体'}の基本選出（初期モデル）` : `${assist.format === 'single' ? '3体' : '4体'}の仮候補`;
      recommended.append(make('div','assist-label',label));
      const picks = make('div','pick-chips');
      assist.recommended.forEach(name => {
        const candidate = assist.candidates.find(c => c.name === name);
        const direct = assist.recommendationSource === 'starter' || (candidate && (candidate.explicitFor.length || candidate.relevantMatches));
        picks.append(make('span',`pick-chip ${direct ? 'supported' : 'provisional'}`,direct ? name : `${name} ※`));
      });
      recommended.append(picks);
    } else {
      recommended.append(make('div','empty','自分の構築との直接データがまだ少ないため、選出だけは自動確定しません。上の「今回まず見ること」を使って対戦し、ログが増えると候補が具体化します。'));
    }

    const highestEvidence = assist.candidates.reduce((max,c) => Math.max(max,c.evidencePoints),0);
    const level = highestEvidence >= 6 ? 'high' : highestEvidence >= 3 ? 'mid' : highestEvidence > 0 ? 'low' : 'none';
    const badge = el('assistEvidence');
    badge.className = `tag ${level === 'high' ? 'low' : level === 'mid' ? 'mid' : 'high'}`;
    text(badge, assist.recommendationSource === 'starter' ? '初期モデル' : evidenceLabel(level));

    const summaryParts = [];
    if (assist.teamFoundation?.plan) summaryParts.push(`${assist.teamFoundation.planSource==='user'?'基本勝ち筋':'初期モデルの勝ち筋'}: ${assist.teamFoundation.plan}`);
    if (assist.warnings.length) summaryParts.push(assist.warnings.join(' / '));
    text(el('assistSummary'), summaryParts.join('  ｜  ') || '自分の過去ログが増えるほど、選出候補の根拠が強くなります。');

    const threats = el('assistThreats'); threats.replaceChildren();
    if (!assist.threats.length) threats.append(make('div','empty','相手を入力すると詳細を表示します。'));
    assist.threats.forEach(t => {
      const card = make('article','assist-card');
      const top = make('div','assist-card-top');
      top.append(make('h3','',t.name), make('span',`tag ${t.baseKnown ? 'low' : t.risk || 'mid'}`,t.baseKnown ? '基本ガイド' : `${Math.round(t.score*100)} 警戒`));
      card.append(top);
      if (t.baseRole) card.append(make('p','focus-role',t.baseRole));
      if (t.baseFocus) card.append(make('p','',t.baseFocus));
      if (t.baseWatch?.length) card.append(make('p','',`基本確認: ${t.baseWatch.join(' / ')}`));
      if (t.sampleSize) card.append(make('p','personal-line',`自分のログ: ${t.appearances}回遭遇・敗戦率 ${fmtPct(t.lossRate)}`));
      if (t.watch) card.append(make('p','',`自分の警戒メモ: ${t.watch}`));
      if (t.answer) card.append(make('p','answer-line',`自分の回答: ${t.answer}`));
      const button = make('button','mini-btn',t.hasNote ? '自分のメモを更新' : '自分の回答を追加（任意）');
      button.type='button'; button.dataset.metaPokemon=t.name; card.append(button);
      threats.append(card);
    });

    const candidates = el('assistCandidates'); candidates.replaceChildren();
    if (!assist.candidates.length) candidates.append(make('div','empty','構築画面で自分のポケモンを登録してください。'));
    assist.candidates.forEach(c => {
      const card = make('article','candidate-card');
      const head = make('div','candidate-head');
      const left = make('div'); left.append(make('h3','',c.name), make('span',`tag ${c.evidenceLevel === 'high' ? 'low' : c.evidenceLevel === 'mid' ? 'mid' : 'high'}`,evidenceLabel(c.evidenceLevel)));
      const score = make('div','candidate-score'); score.append(make('strong','',c.score),make('span','', '参考指数'));
      head.append(left,score); card.append(head);
      c.reasons.forEach(r => card.append(make('p','',`・${r}`)));
      candidates.append(card);
    });

    const failures = el('assistFailures'); failures.replaceChildren();
    if (!assist.pastFailures.length) failures.append(make('div','empty','今回と2体以上共通する過去の敗戦はありません。'));
    assist.pastFailures.forEach(f => {
      const card=make('article','history-card');
      card.append(make('h3','',`${f.date || '日付なし'} ・ 共通 ${f.overlap.join(' / ')}`));
      card.append(make('p','',`その時の選出: ${f.selectedTeam.join(' / ') || '未記録'}`));
      card.append(make('p','',`敗因仮説: ${causeLabel(f.cause)}`));
      if(f.selectionReason) card.append(make('p','',`事前プラン: ${f.selectionReason}`));
      if(f.keyTurn) card.append(make('p','',`重要場面: ${f.keyTurn}`));
      if(f.learning) card.append(make('p','answer-line',`学び: ${f.learning}`));
      failures.append(card);
    });
  }

  function hideAssistView() {
    lastAssist = null;
    ['assistFocusPanel','assistResult','assistThreatPanel','assistCandidatesPanel','assistFailuresPanel'].forEach(id => { el(id).hidden = true; });
    el('assistFocusList').replaceChildren();
    el('assistPrinciples').replaceChildren();
    el('assistRecommended').replaceChildren();
    el('assistThreats').replaceChildren();
    el('assistCandidates').replaceChildren();
    el('assistFailures').replaceChildren();
  }

  function renderAll() {
    renderDashboard(); renderHistory(); renderThreats(el('threatTable')); renderMetaNotes(); renderTeam(); renderOpponentDraft('assist'); renderOpponentDraft('log'); renderOwnSelection(); el('currentRank').value = state.rank || ''; if (lastAssist?.opponent?.length) renderAssist(C.buildSelectionAssist(lastAssist.opponent, state.team.members, state.matches, state.metaNotes, lastAssist.format, teamPlanForFormat(lastAssist.format)));
  }

  function showAnalysis(match) {
    const analysis = C.analyzeMatch(match, state.matches.filter(m => m.id !== match.id));
    el('latestAnalysis').hidden = false;
    text(el('analysisHeadline'), analysis.headline); text(el('analysisSummary'), analysis.summary); text(el('analysisNext'), analysis.nextAction);
    const checks = el('analysisChecks'); checks.replaceChildren();
    analysis.checks.forEach(v => checks.append(make('div','check-item',v)));
  }

  function setToday() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
    el('matchDate').value = local;
  }

  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]'); if (nav) navigate(nav.dataset.nav);
  });

  el('confidence').addEventListener('input', e => text(el('confidenceValue'), e.target.value));
  el('openSettings').addEventListener('click', () => el('settingsDialog').showModal());


  // v0.6 visual selector controls
  C.TYPE_NAMES.forEach(type=>{const o=document.createElement('option');o.value=type;o.textContent=type;el('pokemonTypeFilter').append(o);});
  el('pickTeamMember').addEventListener('click',()=>openPokemonPicker('team'));
  el('pickAssistOpponent').addEventListener('click',()=>openPokemonPicker('assist'));
  el('pickLogOpponent').addEventListener('click',()=>openPokemonPicker('log'));
  el('pickMetaPokemon').addEventListener('click',()=>openPokemonPicker('meta'));
  el('closePokemonPicker').addEventListener('click',()=>{pickerContext=null;el('pokemonPickerDialog').close();});
  el('pokemonPickerDone').addEventListener('click',commitPokemonPicker);
  el('pokemonSearch').addEventListener('input',()=>{pickerVisibleLimit=48;renderPokemonCatalog();});
  el('pokemonTypeFilter').addEventListener('change',()=>{pickerVisibleLimit=48;renderPokemonCatalog();});
  el('clearTeamMembers').addEventListener('click',()=>{teamDraft=[];favoriteDraft='';renderTeamDraft();});
  el('clearAssistOpponent').addEventListener('click',()=>{assistOpponentDraft=[];hideAssistView();renderOpponentDraft('assist');});
  el('clearLogOpponent').addEventListener('click',()=>{logOpponentDraft=[];renderOpponentDraft('log');});
  el('autoCompleteTeam').addEventListener('click',()=>{
    const errorBox=el('teamErrors');
    if(!teamDraft.length){errorBox.hidden=false;text(errorBox,'まず好きなポケモンを1体選んでください。');openPokemonPicker('team');return;}
    const built=C.completeStarterTeam(teamDraft,el('teamFormat').value,catalog,[...unownedIds()]);
    if(built.members.length){teamDraft=built.members;if(!favoriteDraft)favoriteDraft=teamDraft[0];renderTeamDraft();errorBox.hidden=true;
      const added=built.steps.map(x=>`${x.name}（${x.reasons.join('・') || '役割補完'}）`).join(' / ');
      const advice=el('teamStarterAdvice');advice.hidden=false;advice.textContent=`仮組みしました。${added ? '追加理由: '+added : '現在の6体を維持しました。'} 正解の断定ではなく、最初に試す土台です。`;
    }
  });
  el('teamFormat').addEventListener('change',renderTeamDraft);
  el('matchFormat').addEventListener('change',()=>{selectedTeamDraft=[];renderOwnSelection();});

  el('matchForm').addEventListener('submit', e => {
    e.preventDefault();
    const result = document.querySelector('input[name="result"]:checked')?.value || '';
    const match = {
      id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      date: el('matchDate').value,
      format: el('matchFormat').value,
      opponentTeam: normalizedMemberNames(logOpponentDraft),
      selectedTeam: C.uniqNames(selectedTeamDraft),
      result,
      cause: el('cause').value,
      selectionReason: el('selectionReason').value.trim(),
      planOutcome: el('planOutcome').value,
      keyTurn: el('keyTurn').value.trim(),
      confidence: Number(el('confidence').value),
      learning: el('learning').value.trim(),
      createdAt: new Date().toISOString()
    };
    const errors = C.validateMatch(match);
    const errorBox = el('formErrors');
    if (errors.length) { errorBox.hidden=false; errorBox.textContent=errors.join(' / '); return; }
    errorBox.hidden=true; state.matches.push(match); saveState(); showAnalysis(match);
    e.target.reset(); logOpponentDraft=[]; selectedTeamDraft=[]; setToday(); el('confidence').value='3'; text(el('confidenceValue'),'3'); el('planOutcome').value='unknown';
    renderAll(); el('latestAnalysis').scrollIntoView({behavior:'smooth',block:'start'});
  });


  el('assistForm').addEventListener('submit', e => {
    e.preventDefault();
    const rawOpponent = normalizedMemberNames(assistOpponentDraft);
    const opponent = rawOpponent.slice(0,6);
    const format = el('assistFormat').value;
    const errorBox = el('assistErrors');
    const errors = [];
    if (!rawOpponent.length) errors.push('相手のポケモンを1匹以上入力してください');
    if (rawOpponent.length > 6) errors.push('相手は6体まで入力してください');
    if (errors.length) { errorBox.hidden=false; text(errorBox,errors.join(' / ')); return; }
    errorBox.hidden=true;
    renderAssist(C.buildSelectionAssist(opponent, state.team.members, state.matches, state.metaNotes, format, teamPlanForFormat(format)));
    el('assistResult').scrollIntoView({behavior:'smooth',block:'start'});
  });

  el('copyAssistToLog').addEventListener('click', () => {
    if (!lastAssist) return;
    el('matchForm').reset();
    setToday();
    el('confidence').value='3'; text(el('confidenceValue'),'3'); el('planOutcome').value='unknown';
    el('matchFormat').value = lastAssist.format; selectedTeamDraft=[];
    logOpponentDraft=[...lastAssist.opponent]; renderOpponentDraft('log'); renderOwnSelection();
    const focusNames = lastAssist.beginnerGuide?.priorities?.map(r=>r.name).slice(0,2) || [];
    const parts = [];
    if (focusNames.length) parts.push(`事前警戒: ${focusNames.join(' / ')}`);
    if (lastAssist.recommended.length) parts.push(`${lastAssist.recommendationSource==='starter'?'基本選出':'選出仮候補'}: ${lastAssist.recommended.join(' / ')}`);
    if (lastAssist.teamFoundation?.plan) parts.push(`勝ち筋: ${lastAssist.teamFoundation.plan}`);
    if (parts.length) el('selectionReason').value = `${parts.join('。')}。実際の判断に合わせて書き換える。`;
    navigate('log');
    el('pickLogOpponent').focus();
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-meta-pokemon]');
    if (!btn) return;
    el('metaPokemon').value = btn.dataset.metaPokemon;
    navigate('environment');
    el('metaWatch').focus();
  });

  el('metaForm').addEventListener('submit', e => {
    e.preventDefault();
    const rawPokemon=el('metaPokemon').value.trim(); if(!rawPokemon) return;
    const pokemon=resolveMon(rawPokemon)?.name || rawPokemon;
    state.metaNotes.push({ id: Date.now(), pokemon, risk: el('metaRisk').value, role: el('metaRole').value.trim(), watch: el('metaWatch').value.trim(), answer: el('metaAnswer').value.trim() });
    saveState(); e.target.reset(); renderMetaNotes(); if (lastAssist?.opponent?.length) renderAssist(C.buildSelectionAssist(lastAssist.opponent, state.team.members, state.matches, state.metaNotes, lastAssist.format, teamPlanForFormat(lastAssist.format)));
  });

  el('teamForm').addEventListener('submit', e => {
    e.preventDefault();
    const members=normalizedMemberNames(teamDraft);
    const errorBox=el('teamErrors');
    const errors=C.validateCatalogTeam(members,catalog);
    if (errors.length) { errorBox.hidden=false; text(errorBox,errors.join(' / ')); return; }
    if(!members.length){errorBox.hidden=false;text(errorBox,'まず好きなポケモンを1体選んでください。');return;}
    if(members.length<6){errorBox.hidden=false;text(errorBox,`あと${6-members.length}体選んでください。「残りをおまかせで仮組み」も使えます。`);return;}
    errorBox.hidden=true;
    state.team={ name:el('teamName').value.trim(), format:el('teamFormat').value==='single'?'single':'double', members, favorite:(favoriteDraft&&members.includes(favoriteDraft)?favoriteDraft:members[0]), plan:el('teamPlan').value.trim(), weak:el('teamWeak').value.trim() };
    saveState(); renderAll();
  });

  el('adoptFoundationPlan').addEventListener('click', () => {
    const foundation=C.buildTeamFoundation(state.team.members,state.team.format,'');
    if (!foundation.members.length) return;
    state.team.plan=foundation.generatedPlan; el('teamPlan').value=foundation.generatedPlan; saveState(); renderAll();
  });

  el('currentRank').addEventListener('input', e => { state.rank=e.target.value.trim().slice(0,80); saveState(); text(el('rankChip'), `RANK ${state.rank || '未設定'}`); });

  el('exportData').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`champion-coach-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  });

  el('importData').addEventListener('change', async e => {
    const file=e.target.files?.[0]; if(!file) return;
    try { const data=sanitizeImported(JSON.parse(await file.text())); Object.assign(state, data); assistOpponentDraft=[];logOpponentDraft=[];selectedTeamDraft=[];saveState(); hideAssistView(); renderAll(); alert('バックアップを読み込みました。'); }
    catch(_){ alert('読み込めないJSONです。Champion Coachのバックアップを選んでください。'); }
    e.target.value='';
  });

  el('clearData').addEventListener('click', () => {
    if(!confirm('対戦ログ・環境メモ・構築をすべて削除します。よろしいですか？')) return;
    Object.assign(state, defaultState());assistOpponentDraft=[];logOpponentDraft=[];selectedTeamDraft=[];teamDraft=[];favoriteDraft='';replacementTarget=''; saveState(); hideAssistView(); renderAll(); el('settingsDialog').close();
  });

  el('loadDemo').addEventListener('click', () => {
    if(state.matches.length && !confirm('現在のデータにサンプル3試合を追加します。よろしいですか？')) return;
    const samples=[
      {id:`demo-${Date.now()}-1`,date:'2026-09-18',format:'single',opponentTeam:['ボーマンダ','ガブリアス','アシレーヌ','グソクムシャ','カバルドン','サーフゴー'],selectedTeam:['ガブリアス','アシレーヌ','サーフゴー'],result:'loss',cause:'selection',selectionReason:'カバルドン展開への回答を曖昧なまま選出',keyTurn:'ステルスロック＋あくびへの処理順が決まっていなかった',confidence:2,planOutcome:'broken',learning:'選出時に起点作成役への回答を1つ決める'},
      {id:`demo-${Date.now()}-2`,date:'2026-09-17',format:'single',opponentTeam:['ボーマンダ','ガブリアス','マスカーニャ','ミミッキュ','アシレーヌ','カバルドン'],selectedTeam:['ガブリアス','アシレーヌ','カイリュー'],result:'loss',cause:'knowledge',selectionReason:'相手の先発候補を絞らず選出',keyTurn:'タスキ・積み・あくびの複数展開を同時に受けた',confidence:2,planOutcome:'partial',learning:'先発候補を2体まで絞ってから3体を選ぶ'},
      {id:`demo-${Date.now()}-3`,date:'2026-09-16',format:'single',opponentTeam:['ガブリアス','アシレーヌ','サーフゴー','カイリュー','キラフロル','ミミッキュ'],selectedTeam:['ガブリアス','サーフゴー','カイリュー'],result:'win',cause:'unknown',selectionReason:'終盤にカイリューを残す3体選出',keyTurn:'先発で削って終盤の詰め役を温存できた',confidence:4,planOutcome:'held',learning:'3体の役割を先発・中継ぎ・詰めで分ける'}
    ];
    state.matches.push(...samples); saveState(); renderAll(); el('settingsDialog').close();
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  loadFallbackCompetitiveMeta(); setToday(); renderAll(); refreshCompetitiveMeta();
})();
