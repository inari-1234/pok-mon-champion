(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PCCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CAUSE_LABELS = {
    selection: '選出',
    plan: 'ゲームプラン',
    turn: 'ターン判断',
    knowledge: '知識不足',
    execution: '操作・時間',
    luck: '運要素',
    unknown: '未分類'
  };

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function uniqNames(value) {
    if (Array.isArray(value)) {
      return [...new Set(value.map(v => String(v).trim()).filter(Boolean))];
    }
    return [...new Set(String(value || '')
      .split(/[\n,、，/]+/)
      .map(v => v.trim())
      .filter(Boolean))];
  }

  function pct(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100);
  }

  function dateValue(match) {
    const v = Date.parse(match.date || '') || 0;
    return v;
  }

  function sortedMatches(matches) {
    return [...(matches || [])].sort((a, b) => dateValue(b) - dateValue(a));
  }

  function calculateStats(matches, format) {
    const mode=format==='single'?'single':format==='double'?'double':'';
    const source=mode?(matches||[]).filter(m=>(m.format==='single'?'single':'double')===mode):(matches||[]);
    const list = sortedMatches(source);
    const total = list.length;
    const wins = list.filter(m => m.result === 'win').length;
    const losses = list.filter(m => m.result === 'loss').length;
    const recent = list.slice(0, 10);
    const recentWins = recent.filter(m => m.result === 'win').length;

    let streak = 0;
    let streakResult = null;
    for (const m of list) {
      if (!streakResult) streakResult = m.result;
      if (m.result !== streakResult) break;
      streak += 1;
    }

    const causeCounts = {};
    for (const m of list.filter(m => m.result === 'loss')) {
      const cause = m.cause || 'unknown';
      causeCounts[cause] = (causeCounts[cause] || 0) + 1;
    }
    const topCause = Object.entries(causeCounts).sort((a, b) => b[1] - a[1])[0] || null;

    return {
      total,
      wins,
      losses,
      winRate: total ? wins / total : 0,
      recentCount: recent.length,
      recentWinRate: recent.length ? recentWins / recent.length : 0,
      streak,
      streakResult,
      topLossCause: topCause ? topCause[0] : null,
      topLossCauseCount: topCause ? topCause[1] : 0
    };
  }

  function aggregateOpponentPokemon(matches, format) {
    const mode=format==='single'?'single':format==='double'?'double':'';
    const source=mode?(matches||[]).filter(m=>(m.format==='single'?'single':'double')===mode):(matches||[]);
    const sorted = sortedMatches(source);
    const totalMatches = sorted.length || 1;
    const recentIds = new Set(sorted.slice(0, 10).map(m => m.id));
    const map = new Map();

    for (const m of sorted) {
      for (const name of uniqNames(m.opponentTeam)) {
        if (!map.has(name)) {
          map.set(name, { name, appearances: 0, wins: 0, losses: 0, recent: 0 });
        }
        const row = map.get(name);
        row.appearances += 1;
        if (m.result === 'win') row.wins += 1;
        if (m.result === 'loss') row.losses += 1;
        if (recentIds.has(m.id)) row.recent += 1;
      }
    }

    const maxAppearances = Math.max(1, ...[...map.values()].map(v => v.appearances));
    return [...map.values()].map(row => {
      const samples = row.wins + row.losses;
      const lossRate = samples ? row.losses / samples : 0;
      const frequency = row.appearances / maxAppearances;
      const recentShare = row.recent / Math.min(10, totalMatches);
      const dangerScore = clamp(frequency * 0.50 + lossRate * 0.35 + recentShare * 0.15, 0, 1);
      return {
        ...row,
        lossRate,
        winRate: samples ? row.wins / samples : 0,
        dangerScore,
        sampleSize: samples
      };
    }).sort((a, b) => b.dangerScore - a.dangerScore || b.appearances - a.appearances);
  }

  function aggregateOwnSelections(matches, format) {
    const mode=format==='single'?'single':format==='double'?'double':'';
    const source=mode?(matches||[]).filter(m=>(m.format==='single'?'single':'double')===mode):(matches||[]);
    const map = new Map();
    for (const m of source) {
      for (const name of uniqNames(m.selectedTeam)) {
        if (!map.has(name)) map.set(name, { name, picks: 0, wins: 0, losses: 0 });
        const row = map.get(name);
        row.picks += 1;
        if (m.result === 'win') row.wins += 1;
        if (m.result === 'loss') row.losses += 1;
      }
    }
    return [...map.values()].map(row => ({
      ...row,
      winRate: row.picks ? row.wins / row.picks : 0
    })).sort((a, b) => b.picks - a.picks || b.winRate - a.winRate);
  }

  function analyzeMatch(match, history) {
    const opponent = uniqNames(match.opponentTeam);
    const selected = uniqNames(match.selectedTeam);
    const threats = aggregateOpponentPokemon([...(history || []), match]);
    const knownProblems = threats.filter(t => opponent.includes(t.name) && t.sampleSize >= 2 && t.lossRate >= 0.6).slice(0, 2);

    const result = {
      headline: '',
      summary: '',
      checks: [],
      nextAction: ''
    };

    if (match.result === 'win') {
      result.headline = '勝ち筋の再現性を残す';
      result.summary = '勝利でも結果だけで終わらせず、選出理由と最も重要だった分岐を残すと、再現できる勝ち方になります。';
      result.checks.push(`選出: ${selected.length ? selected.join(' / ') : '未記録'}`);
      if (match.selectionReason) result.checks.push(`事前プラン: ${match.selectionReason}`);
      if (match.planOutcome && PLAN_OUTCOME_LABELS[match.planOutcome]) result.checks.push(`プラン結果: ${PLAN_OUTCOME_LABELS[match.planOutcome]}`);
      if (match.keyTurn) result.checks.push(`重要ターン: ${match.keyTurn}`);
      result.nextAction = '次戦でも同じ条件なら同じ選出をするか、1行で理由を残す。';
      return result;
    }

    const cause = match.cause || 'unknown';
    if (cause === 'selection') {
      result.headline = 'ターン操作より先に選出を修正';
      result.summary = '敗因が選出なら、細かな技選択を直す前に「相手6体に対する役割不足」を確認する方が改善効率が高いです。';
      result.nextAction = '相手の最大2つの脅威に対して、選出3/4体の誰が回答するかを書き直す。';
    } else if (cause === 'plan') {
      result.headline = '初手からの勝ち筋を明文化';
      result.summary = '個々の技より「何を通せば勝ちか」が曖昧だった可能性があります。初手・中盤・詰めの役割を分けて振り返ります。';
      result.nextAction = '次戦前に「最終的に誰を通すか」を1体だけ決めて選出する。';
    } else if (cause === 'turn') {
      result.headline = '重要ターンを1つだけ再検証';
      result.summary = '全ターンを反省するより、勝率を大きく変えた1手を切り出す方が改善点を固定しやすいです。';
      result.nextAction = 'そのターン時点で判明していた情報だけを使い、安全策・強気択・交換の3案を比較する。';
    } else if (cause === 'knowledge') {
      result.headline = '知識穴を次戦までに1つ埋める';
      result.summary = '新ポケモン・持ち物・素早さ・技範囲の知識不足は、プレイ精度とは別問題として扱います。';
      result.nextAction = '分からなかったポケモン/技/持ち物を環境メモへ登録し、次回の警戒事項にする。';
    } else if (cause === 'luck') {
      result.headline = '運要素と判断を分離';
      result.summary = '急所・命中・追加効果だけを敗因にせず、その前にリスクを下げられる選択肢があったかだけ確認します。';
      result.nextAction = '同じ乱数・命中外しが起きなくても妥当な選択だったかを判定し、妥当なら修正対象にしない。';
    } else {
      result.headline = '敗因を1カテゴリに仮置き';
      result.summary = '原因を完全に当てる必要はありません。選出・ゲームプラン・ターン判断・知識のどこから見直すかを仮決めします。';
      result.nextAction = '最も早い時点で「不利になった」と感じた場面を1つ記録する。';
    }

    if (knownProblems.length) {
      result.checks.push(`要警戒: ${knownProblems.map(v => `${v.name}（ログ上敗戦率${pct(v.lossRate)}%）`).join(' / ')}`);
    }
    if (match.confidence && Number(match.confidence) <= 2) {
      result.checks.push('判断確信度が低い: 知識不足と読み負けを分けて確認');
    }
    if (match.selectionReason) result.checks.push(`事前プラン: ${match.selectionReason}`);
    if (match.keyTurn) result.checks.push(`重要ターン: ${match.keyTurn}`);
    if (match.planOutcome && PLAN_OUTCOME_LABELS[match.planOutcome]) result.checks.push(`プラン結果: ${PLAN_OUTCOME_LABELS[match.planOutcome]}`);
    if (match.learning) result.checks.push(`自分の学び: ${match.learning}`);
    return result;
  }


  const BASE_KNOWLEDGE_VERSION = 'Regulation M-C / 2026-09-18';
  const BASE_KNOWLEDGE = [
    { names:['メガボーマンダ','ボーマンダ'], formats:['double'], priority:.95, role:'高速アタッカー / いかく / 素早さ操作', focus:'「いかく」で物理火力を下げられた上で、おいかぜや範囲打点を通される展開を警戒。', watch:['メガ前の「いかく」','「おいかぜ」による素早さ操作','スカイスキン＋ハイパーボイス系の範囲打点'], tags:['speed','spread','intimidate'] },
    { names:['ゴリランダー'], formats:['double'], priority:.92, role:'フィールド / ねこだまし / 先制技', focus:'初手の「ねこだまし」と、グラスフィールド下の先制技で行動順を崩される点を先に確認。', watch:['「ねこだまし」で片側を止める動き','グラスフィールド','グラススライダーなどの先制圧力'], tags:['fakeout','priority','field'] },
    { names:['オオニューラ'], formats:['double'], priority:.9, role:'高速アタッカー / 妨害', focus:'高い素早さから攻撃と補助の両方を取れるため、初手で自由に動かせない。', watch:['「ねこだまし」','フェイタルクローの追加効果','コーチングなどの補助'], tags:['fakeout','speed','disrupt'] },
    { names:['ドドゲザン'], formats:['double'], priority:.89, role:'低速高火力 / 先制技 / いかく牽制', focus:'「いかく」を安易に入れると「まけんき」で逆に強化される可能性。削れた終盤は「ふいうち」圏内も確認。', watch:['「まけんき」','「ふいうち」','格闘弱点を突けるか'], tags:['priority','antiIntimidate'] },
    { names:['イダイトウ','イダイトウ（オス）','イダイトウ（オスのすがた）'], formats:['double'], priority:.88, role:'高火力アタッカー / 雨適性', focus:'ねこだましが通らず、雨や終盤の高火力で一気に詰められる展開を警戒。', watch:['ゴーストタイプで「ねこだまし」無効','雨＋すいすいの可能性','終盤の高火力'], tags:['weather','speed'] },
    { names:['イエッサン','イエッサン♀','イエッサン（メス）','イエッサン（メスのすがた）'], formats:['double'], priority:.87, role:'サイコフィールド / このゆび / トリックルーム', focus:'「このゆびとまれ」で攻撃先をずらしながらトリックルーム等を通す並びを最優先で確認。', watch:['サイコフィールドで先制技を止める','「このゆびとまれ」','「トリックルーム」'], tags:['redirect','trickroom','field'] },
    { names:['リキキリン'], formats:['double'], priority:.86, role:'先制技封じ / トリックルーム', focus:'テイルアーマーで先制技が止まりやすい。トリックルーム始動を許すかどうかを初手から判断。', watch:['テイルアーマー','「トリックルーム」','高めの耐久'], tags:['trickroom','priorityBlock'] },
    { names:['ヤバソチャ'], formats:['double'], priority:.82, role:'回復 / いかりのこな / トリックルーム', focus:'味方を回復しながら攻撃先をずらしたりトリックルームを通したりする支援役として警戒。', watch:['おもてなしによる味方回復','「いかりのこな」','「トリックルーム」'], tags:['redirect','trickroom'] },
    { names:['ガオガエン'], formats:['double'], priority:.84, role:'いかく / ねこだまし / サイクル支援', focus:'初手の「ねこだまし」と「いかく」でテンポを取られやすい。物理偏重の選出になっていないか確認。', watch:['「いかく」','「ねこだまし」','すてゼリフ等での交代支援'], tags:['fakeout','intimidate'] },
    { names:['エルフーン'], formats:['double'], priority:.81, role:'高速支援 / 素早さ操作', focus:'補助技からテンポを取る役。特においかぜ等の素早さ操作を自由に通させない。', watch:['おいかぜ等の素早さ操作','先制補助技','ちょうはつ等の妨害'], tags:['speed','disrupt'] },
    { names:['ブリジュラス'], formats:['double'], priority:.8, role:'高耐久アタッカー', focus:'物理で殴るほど耐久が上がる型や、一度は行動を保証する型を想定して処理順を決める。', watch:['じきゅうりょく','がんじょう','特殊打点を通せるか'], tags:['bulky'] },
    { names:['フシギバナ'], formats:['double'], priority:.79, role:'晴れ高速化 / 眠り妨害', focus:'晴れ下では素早さが上がり、ねむりごなから試合を崩されやすい。天候要員との並びを確認。', watch:['ようりょくそ','「ねむりごな」','晴れ要員との同時選出'], tags:['weather','speed','sleep'] },
    { names:['メガライチュウY'], formats:['double'], priority:.8, role:'高速特殊 / 命中安定化 / ねこだまし', focus:'高速から高火力・妨害を両立しやすい。ノーガードによる命中不安技の必中化も前提にする。', watch:['ノーガード','でんじほう等の高威力技','「ねこだまし」'], tags:['speed','fakeout','disrupt'] },
    { names:['メガグソクムシャ','グソクムシャ'], formats:['double','single'], priority:.82, role:'高耐久物理アタッカー', focus:'非常に高い物理耐久と高火力を両立するため、物理だけで正面突破しない。', watch:['高い物理耐久','かたいツメ','低速を逆利用する展開'], tags:['bulky','physical'] },
    { names:['メガガブリアスZ'], formats:['double','single'], priority:.87, role:'超高速特殊寄りアタッカー', focus:'非常に高い素早さから動き、ふゆうで地面技が無効。従来のガブリアスと同じ処理をしない。', watch:['素早さ151相当','「ふゆう」で地面無効','特殊火力'], tags:['speed','groundImmune'] },
    { names:['メガルカリオZ'], formats:['double','single'], priority:.86, role:'超高速特殊アタッカー', focus:'非常に高い素早さと特殊火力を持つため、上から処理する前提を置きにくい。', watch:['素早さ151相当','高い特殊火力','かくとう・はがね打点'], tags:['speed'] },
    { names:['メガセグレイブ','セグレイブ'], formats:['double','single'], priority:.84, role:'高火力物理アタッカー', focus:'高い攻撃と耐久で一度動かれると負荷が大きい。炎技で強化される可能性も確認。', watch:['高い物理火力','ねつこうかん','氷・ドラゴン打点'], tags:['physical','bulky'] },
    { names:['メガアブソルZ'], formats:['double','single'], priority:.8, role:'超高速物理アタッカー', focus:'非常に高い素早さと攻撃から切れ味対象技の火力を押し付ける型を警戒。', watch:['素早さ151相当','「きれあじ」','低耐久ゆえ先制技圏内か'], tags:['speed','physical'] },

    { names:['ブリジュラス'], formats:['single'], priority:.94, role:'高耐久 / 型が複数', focus:'「がんじょう」と「じきゅうりょく」の両方を想定し、物理だけで押し切る計画にしない。', watch:['がんじょう','じきゅうりょく','特殊打点'], tags:['bulky'] },
    { names:['カバルドン'], formats:['single'], priority:.93, role:'起点作成 / 物理受け', focus:'ステルスロック＋あくびで交代を強要される展開を最優先でケア。', watch:['「ステルスロック」','「あくび」','「なまける」'], tags:['hazard','yawn','bulky'] },
    { names:['ガブリアス'], formats:['single'], priority:.92, role:'高速物理 / 型が多い', focus:'タスキ・スカーフ・起点作成など型の幅が広い。最初の1手で型を決め打ちしない。', watch:['こだわりスカーフ','きあいのタスキ','ステルスロック/まきびし'], tags:['speed','hazard'] },
    { names:['ゴリランダー'], formats:['single'], priority:.87, role:'物理アタッカー / 先制技', focus:'グラスフィールド下のグラススライダーで終盤の削れたポケモンを縛られる。', watch:['グラスフィールド','「グラススライダー」','高火力草打点'], tags:['priority','field'] },
    { names:['ミミッキュ'], formats:['single'], priority:.83, role:'行動保証 / 積み / 先制技', focus:'ばけのかわで一度動かれる前提を置き、積み技からの全抜きを許さない。', watch:['ばけのかわ','積み技','かげうち等の先制技'], tags:['setup','priority'] },
    { names:['サーフゴー'], formats:['single','double'], priority:.81, role:'特殊アタッカー / 変化技耐性', focus:'変化技で止める計画が通りにくい。攻撃技で処理できるルートを残す。', watch:['変化技無効化系の特性','高火力特殊打点','はがね・ゴーストの耐性'], tags:['special'] },
    { names:['キラフロル'], formats:['single'], priority:.79, role:'起点作成 / 特殊', focus:'接触・物理で雑に触ると場を荒らされやすい。先発時は起点作成を疑う。', watch:['設置技','どく展開','特殊火力'], tags:['hazard'] },
    { names:['ギルガルド'], formats:['single'], priority:.78, role:'フォルム変化 / 受けと攻めの切替', focus:'キングシールド等で攻撃タイミングをずらされるため、接触技の連打を避ける。', watch:['キングシールド','フォルム変化','先制技'], tags:['priority','disrupt'] },
    { names:['アシレーヌ'], formats:['single'], priority:.78, role:'特殊アタッカー / 高特殊耐久', focus:'特殊同士の打ち合いだけで処理しようとせず、物理打点や上からの圧力を確認。', watch:['みず・フェアリー打点','高い特殊耐久','回復・耐久寄りの型'], tags:['special','bulky'] }
  ];


  const TEAM_PROFILE_OVERRIDES = [
    {names:['メガボーマンダ','ボーマンダ'],formats:['double'],tags:['attacker','fast','speedControl','intimidate','finisher'],lead:88,back:88},
    {names:['ゴリランダー'],formats:['double'],tags:['attacker','support','fakeout','priority','field','pivot'],lead:92,back:76},
    {names:['オオニューラ'],formats:['double'],tags:['attacker','fast','fakeout','disrupt'],lead:90,back:78},
    {names:['ドドゲザン'],formats:['double'],tags:['attacker','priority','finisher','antiIntimidate','bulky'],lead:58,back:92},
    {names:['イダイトウ','イダイトウ（オス）','イダイトウ（オスのすがた）'],formats:['double'],tags:['attacker','fast','weather','finisher'],lead:64,back:92},
    {names:['イエッサン','イエッサン♀','イエッサン（メス）','イエッサン（メスのすがた）'],formats:['double'],tags:['support','redirect','trickroom','field'],lead:94,back:48},
    {names:['リキキリン'],formats:['double'],tags:['support','trickroom','priorityBlock','bulky'],lead:88,back:58},
    {names:['ヤバソチャ'],formats:['double'],tags:['support','redirect','trickroom','sustain'],lead:84,back:62},
    {names:['ガオガエン'],formats:['double'],tags:['support','fakeout','intimidate','pivot','bulky'],lead:96,back:72},
    {names:['エルフーン'],formats:['double'],tags:['support','speedControl','disrupt'],lead:96,back:46},
    {names:['フシギバナ'],formats:['double'],tags:['attacker','fast','weather','disrupt'],lead:76,back:78},
    {names:['メガライチュウY'],formats:['double'],tags:['attacker','fast','fakeout','disrupt'],lead:92,back:82},
    {names:['メガグソクムシャ','グソクムシャ'],formats:['double'],tags:['attacker','bulky','slow','finisher'],lead:62,back:92},
    {names:['メガガブリアスZ'],formats:['double'],tags:['attacker','fast','special','finisher'],lead:82,back:92},
    {names:['メガルカリオZ'],formats:['double'],tags:['attacker','fast','special','finisher'],lead:84,back:92},
    {names:['メガセグレイブ','セグレイブ'],formats:['double'],tags:['attacker','bulky','physical','finisher'],lead:72,back:92},
    {names:['メガアブソルZ'],formats:['double'],tags:['attacker','fast','physical','finisher'],lead:82,back:92},
    {names:['サーフゴー'],formats:['double'],tags:['attacker','special','spread','finisher'],lead:74,back:90},
    {names:['カイリュー'],formats:['double'],tags:['attacker','bulky','priority','finisher'],lead:66,back:92},
    {names:['モロバレル'],formats:['double'],tags:['support','redirect','sleep','sustain','bulky'],lead:92,back:58},
    {names:['ウーラオス'],formats:['double'],tags:['attacker','physical','fast','priority'],lead:82,back:86},
    {names:['ブリムオン'],formats:['double'],tags:['attacker','special','trickroom','slow'],lead:78,back:86},
    {names:['ペリッパー'],formats:['double'],tags:['support','weather','pivot'],lead:90,back:56},
    {names:['コータス'],formats:['double'],tags:['attacker','weather','slow','spread'],lead:62,back:88},
    {names:['トルネロス'],formats:['double'],tags:['support','speedControl','weather','disrupt'],lead:96,back:48},

    {names:['ブリジュラス'],formats:['single'],tags:['attacker','bulky','special'],lead:76,back:86},
    {names:['カバルドン'],formats:['single'],tags:['support','hazard','yawn','bulky'],lead:94,back:58},
    {names:['ガブリアス'],formats:['single'],tags:['attacker','fast','hazard'],lead:88,back:86},
    {names:['ゴリランダー'],formats:['single'],tags:['attacker','priority','field','finisher'],lead:76,back:90},
    {names:['ミミッキュ'],formats:['single'],tags:['attacker','setup','priority','finisher'],lead:72,back:94},
    {names:['サーフゴー'],formats:['single'],tags:['attacker','special','finisher'],lead:78,back:90},
    {names:['キラフロル'],formats:['single'],tags:['support','hazard','special'],lead:94,back:52},
    {names:['ギルガルド'],formats:['single'],tags:['attacker','bulky','priority'],lead:70,back:86},
    {names:['アシレーヌ'],formats:['single'],tags:['attacker','special','bulky'],lead:68,back:88},
    {names:['カイリュー'],formats:['single'],tags:['attacker','setup','priority','bulky','finisher'],lead:72,back:94},
    {names:['メガグソクムシャ','グソクムシャ'],formats:['single'],tags:['attacker','bulky','slow','finisher'],lead:60,back:92},
    {names:['メガガブリアスZ'],formats:['single'],tags:['attacker','fast','special','finisher'],lead:84,back:94},
    {names:['メガルカリオZ'],formats:['single'],tags:['attacker','fast','special','finisher'],lead:86,back:94},
    {names:['メガセグレイブ','セグレイブ'],formats:['single'],tags:['attacker','bulky','physical','finisher'],lead:72,back:92},
    {names:['メガアブソルZ'],formats:['single'],tags:['attacker','fast','physical','finisher'],lead:84,back:94}
  ];

  const TEAM_TAG_LABELS = {
    attacker:'攻撃役', support:'支援役', fast:'高速', slow:'低速', speedControl:'素早さ操作',
    fakeout:'ねこだまし', redirect:'攻撃先変更', trickroom:'トリックルーム', priority:'先制技',
    priorityBlock:'先制技封じ', intimidate:'いかく', antiIntimidate:'いかく牽制', field:'フィールド',
    weather:'天候', setup:'積み', hazard:'設置技', yawn:'あくび', sleep:'眠り', disrupt:'妨害',
    bulky:'耐久', sustain:'回復', pivot:'交代支援', finisher:'終盤役', physical:'物理', special:'特殊', spread:'範囲打点'
  };

  function findTeamProfile(name, format) {
    const target = String(name || '').trim();
    const mode = format === 'single' ? 'single' : 'double';
    if (!target) return null;
    const override = TEAM_PROFILE_OVERRIDES.find(row => row.names.includes(target) && row.formats.includes(mode));
    if (override) return {...override, name:target, known:true};
    const base = findBaseKnowledge(target, mode);
    if (!base) return null;
    const role = String(base.role || '');
    const tags = new Set(base.tags || []);
    if (/アタッカー|高火力|物理|特殊/.test(role)) tags.add('attacker');
    if (/支援|いかく|フィールド|トリックルーム|妨害/.test(role)) tags.add('support');
    if (/高速/.test(role)) tags.add('fast');
    if (/低速/.test(role)) tags.add('slow');
    if (/素早さ操作/.test(role)) tags.add('speedControl');
    if (tags.has('priority') && tags.has('attacker')) tags.add('finisher');
    return {name:target,names:[target],formats:[mode],tags:[...tags],lead:tags.has('support')?82:72,back:tags.has('attacker')?84:62,known:true};
  }

  function buildTeamFoundation(teamMembers, format, userPlan) {
    const mode = format === 'single' ? 'single' : 'double';
    const members = uniqNames(teamMembers).slice(0,6);
    const profiles = members.map((name,index) => {
      const p = findTeamProfile(name, mode);
      return p ? {...p, originalIndex:index, labels:p.tags.map(t=>TEAM_TAG_LABELS[t]||t)} : {name,known:false,tags:[],labels:[],lead:50,back:50,originalIndex:index};
    });
    const known = profiles.filter(p=>p.known);
    const coverage = members.length ? known.length / members.length : 0;
    const count = tag => known.filter(p=>p.tags.includes(tag)).length;
    const has = tag => count(tag) > 0;
    const attackers = known.filter(p=>p.tags.includes('attacker'));
    const supports = known.filter(p=>p.tags.includes('support') || ['fakeout','redirect','intimidate','speedControl','trickroom','hazard','yawn'].some(t=>p.tags.includes(t)));
    const finishers = known.filter(p=>p.tags.includes('finisher') || p.tags.includes('priority') || (p.tags.includes('attacker') && p.tags.includes('fast')));

    const strengths=[];
    const gaps=[];
    const pushStrength=(text)=>{if(strengths.length<3&&!strengths.includes(text))strengths.push(text)};
    const pushGap=(text)=>{if(gaps.length<3&&!gaps.includes(text))gaps.push(text)};
    if (mode === 'double') {
      if (has('speedControl') || has('trickroom')) pushStrength('行動順を動かす手段を初期モデルで確認できる。');
      else pushGap('登録名だけでは、素早さ操作・トリックルームのような行動順管理を確認できない。技構成にあるなら基本勝ち筋へ追記する。');
      if (has('fakeout') || has('redirect') || has('intimidate') || has('disrupt')) pushStrength('初手の行動回数を作る支援・妨害役が見える。');
      else pushGap('初手を安定させる支援・妨害役を初期モデルでは確認できない。');
      if (attackers.length >= 2) pushStrength('攻撃役を複数確認でき、1体を温存する基本プランを作りやすい。');
      else pushGap('攻めの軸を自動判定できるポケモンが少ない。基本勝ち筋を1行だけ手入力すると精度が上がる。');
    } else {
      if (has('hazard') || has('yawn')) pushStrength('先発から相手の交代・削りを動かす役が見える。');
      if (has('setup')) pushStrength('積みから終盤を作る勝ち筋を確認できる。');
      if (has('priority') || has('fast')) pushStrength('終盤の行動順を確保しやすい役が見える。');
      else pushGap('高速処理・先制技など終盤の行動順を確保する要素を初期モデルでは確認できない。');
      if (attackers.length < 2) pushGap('攻めの軸を自動判定できるポケモンが少ない。基本勝ち筋を1行だけ手入力すると精度が上がる。');
      if (!has('hazard') && !has('setup') && !has('yawn')) pushGap('先発から試合を動かす手段を初期モデルでは確認できない。');
    }
    if (members.length < 6) pushGap('6体すべて登録すると、基本選出と役割の抜けを判定しやすくなる。');
    if (members.length && coverage < .5) pushGap('初期モデル未登録のポケモンが多いため、提案は低確信。手入力の基本勝ち筋を優先する。');

    let generatedPlan='';
    let planPattern='generic';
    if (mode === 'double') {
      if (has('trickroom') && (has('slow') || has('bulky'))) { generatedPlan='トリックルームを通すターンを先に作り、低速・高耐久の攻撃役を動かす。終盤役はトリックルーム終了後まで残す。'; planPattern='trickroom'; }
      else if (has('speedControl') && attackers.length >= 2) { generatedPlan='素早さ操作を先に通し、攻撃役の行動回数を確保する。序盤で全員を削り切ろうとせず、終盤役を1体残す。'; planPattern='speed'; }
      else if ((has('fakeout') || has('redirect') || has('intimidate')) && attackers.length) { generatedPlan='支援・妨害で安全な1ターンを作り、攻撃役を動かす。攻撃役を同時に失わず、最後に1体を残す。'; planPattern='support'; }
      else if (has('weather') && attackers.length) { generatedPlan='天候を利用するターンを明確にし、その間に攻撃役の行動回数を稼ぐ。天候が切れた後の終盤役も1体残す。'; planPattern='weather'; }
      else if (attackers.length) { generatedPlan='攻撃役を1体だけ「最後に残す役」と決め、もう1体で先に相手を削る。初手からエース2体を同時に失わない。'; planPattern='attacker'; }
    } else {
      if (has('hazard') || has('yawn')) { generatedPlan='先発で交代・削りを発生させ、相手の終盤回答を先に消耗させる。最後は高速役・先制技・積み役のいずれかを通す。'; planPattern='chip'; }
      else if (has('setup')) { generatedPlan='積み役をすぐ出すのではなく、相手の止め役を先に削る。止め役が弱った段階で積みから終盤を作る。'; planPattern='setup'; }
      else if (finishers.length) { generatedPlan='序盤は相手の受け・高速役を削り、終盤役を温存する。最後に上から、または先制技で取り切る形を目指す。'; planPattern='finisher'; }
      else if (attackers.length) { generatedPlan='最も通しやすい攻撃役を1体決め、そのポケモンが止まる相手を先に削る。選出3体すべてを同時に役割消耗させない。'; planPattern='attacker'; }
    }
    if (!generatedPlan) generatedPlan='まず「最後に残したい1体」を決め、そのポケモンが動きやすくなるように残りの選出で1～2ターンを作る。';
    const plan = String(userPlan || '').trim() || generatedPlan;
    const planSource = String(userPlan || '').trim() ? 'user' : 'starter';

    const leadSorted=[...known].sort((a,b)=>b.lead-a.lead||a.originalIndex-b.originalIndex);
    const backSorted=[...known].sort((a,b)=>b.back-a.back||a.originalIndex-b.originalIndex);
    const picks=[];
    const addPick=p=>{if(p&&!picks.includes(p.name))picks.push(p.name)};
    const sortLead=list=>[...list].sort((a,b)=>b.lead-a.lead||a.originalIndex-b.originalIndex);
    const sortBack=list=>[...list].sort((a,b)=>b.back-a.back||a.originalIndex-b.originalIndex);
    if (mode === 'double') {
      const pureAttackers=attackers.filter(p=>!p.tags.includes('support'));
      if (planPattern === 'trickroom') {
        const trSupport=supports.filter(p=>p.tags.includes('trickroom'));
        const trAttack=attackers.filter(p=>p.tags.includes('trickroom'));
        addPick(sortLead(trSupport)[0] || sortLead(trAttack)[0]);
        addPick(sortLead(trAttack).find(p=>!picks.includes(p.name)) || sortLead(attackers).find(p=>!picks.includes(p.name)));
        sortBack(attackers.filter(p=>p.tags.includes('slow') || p.tags.includes('bulky') || p.tags.includes('finisher'))).forEach(addPick);
      } else if (planPattern === 'speed') {
        const speedControllers=known.filter(p=>p.tags.includes('speedControl'));
        addPick(sortLead(speedControllers)[0]);
        addPick(sortLead(pureAttackers).find(p=>!picks.includes(p.name)) || sortLead(attackers).find(p=>!picks.includes(p.name)));
        sortBack(finishers).forEach(addPick);
      } else if (planPattern === 'weather') {
        const weatherSupport=supports.filter(p=>p.tags.includes('weather'));
        const weatherAttack=attackers.filter(p=>p.tags.includes('weather'));
        addPick(sortLead(weatherSupport)[0] || sortLead(weatherAttack)[0]);
        addPick(sortLead(weatherAttack).find(p=>!picks.includes(p.name)) || sortLead(pureAttackers).find(p=>!picks.includes(p.name)));
        sortBack(finishers).forEach(addPick);
      } else {
        const supportLead=sortLead(supports)[0];
        const attackLead=sortLead(pureAttackers).find(p=>p.name!==supportLead?.name) || sortLead(attackers).find(p=>p.name!==supportLead?.name);
        addPick(supportLead || leadSorted[0]); addPick(attackLead || leadSorted.find(p=>!picks.includes(p.name)));
        sortBack(finishers).forEach(addPick);
      }
      backSorted.forEach(addPick);
    } else {
      const opener=[...known].sort((a,b)=>b.lead-a.lead||a.originalIndex-b.originalIndex)[0];
      addPick(opener);
      sortBack(finishers).forEach(addPick);
      backSorted.forEach(addPick);
    }
    const pickCount=mode==='single'?3:4;
    const basicSelection = known.length >= pickCount && coverage >= .5 ? picks.slice(0,pickCount) : [];
    const selectionConfidence = basicSelection.length
      ? (coverage >= .83 && (supports.length || mode==='single') && attackers.length >= 2 ? 'mid' : 'low')
      : 'none';
    const basicLead = basicSelection.length ? basicSelection.slice(0, mode==='single'?1:2) : [];
    const basicBack = basicSelection.length ? basicSelection.slice(mode==='single'?1:2, pickCount) : [];

    const roleSummary = profiles.map(p=>({name:p.name,known:p.known,labels:p.labels.slice(0,4)}));
    return {
      version:BASE_KNOWLEDGE_VERSION,format:mode,members,profiles:roleSummary,coverage,
      strengths,gaps,plan,generatedPlan,planSource,planPattern,basicSelection,basicLead,basicBack,selectionConfidence,
      counts:{known:known.length,attackers:attackers.length,supports:supports.length,finishers:finishers.length}
    };
  }

  const PLAN_OUTCOME_LABELS = {held:'機能した',partial:'途中まで',broken:'早めに崩れた',unknown:'未記録'};

  function buildProgressSnapshot(matches, foundation) {
    const mode = foundation?.format;
    const list = sortedMatches(matches || []).filter(m => !mode || (m.format === 'single' ? 'single' : 'double') === mode);
    const total = list.length;
    const recent = list.slice(0,5);
    const prepCount = recent.filter(m=>String(m.selectionReason||'').trim()).length;
    const reviewCount = recent.filter(m=>String(m.keyTurn||'').trim() || String(m.learning||'').trim()).length;
    const outcomes = recent.filter(m=>['held','partial','broken'].includes(m.planOutcome));
    const outcomeScore = outcomes.length ? outcomes.reduce((sum,m)=>sum+(m.planOutcome==='held'?1:m.planOutcome==='partial'?.5:0),0)/outcomes.length : null;
    const losses = recent.filter(m=>m.result==='loss');
    const causeCounts={};
    losses.forEach(m=>{const c=m.cause||'unknown';causeCounts[c]=(causeCounts[c]||0)+1});
    const repeat = Object.entries(causeCounts).sort((a,b)=>b[1]-a[1])[0] || null;
    const repeatedCause = repeat && repeat[1] >= 2 ? repeat[0] : null;
    let stage='foundation',stageLabel='土台作り',message='まず基本戦術を1本に絞り、勝敗より「同じ考え方で試せたか」を確認する段階です。';
    if (total>=1 && total<=2) { stage='stabilize';stageLabel='型を固定';message='まだ構築を頻繁に変えず、同じ基本選出・勝ち筋を数戦試して崩れる場所を見ます。'; }
    else if (total>=3 && total<=5) { stage='diagnose';stageLabel='負け方を整理';message='勝率より、同じ敗因が繰り返されているかを優先して見ます。'; }
    else if (total>=6) { stage='personalize';stageLabel='個人最適化';message='個人ログを選出・要警戒・基本戦術へ反映できる段階です。'; }

    const causeAction={selection:'次の数戦は構築変更より、相手の最大2脅威に回答できる基本選出を固定する。',plan:'選出を変える前に「最後に誰を残すか」を1体だけ決めてから対戦する。',turn:'基本選出は維持し、最も勝敗を動かした1ターンだけ比較する。',knowledge:'分からなかったポケモン・技を1つだけ環境メモへ追加して次戦へ進む。',execution:'時間切れ・操作を減らすため、初手の方針を対戦前に1行で決める。',luck:'同じ運要素がなくても妥当な択だったかだけ確認し、妥当なら構築を変えない。',unknown:'最初に不利になった場面を1つだけ敗因カテゴリへ仮置きする。'};
    let nextFocus='';
    if (!total) {
      if (foundation?.basicSelection?.length) nextFocus=`まず基本選出のたたき台「${foundation.basicSelection.join(' / ')}」を1～2戦試し、勝敗よりプランがどこで崩れたかだけ記録する。`;
      else if (foundation?.gaps?.length) nextFocus=foundation.gaps[0];
      else nextFocus='構築6体を登録すると、0戦から基本戦術の仮説を作れます。';
    } else if (repeatedCause) nextFocus=causeAction[repeatedCause] || causeAction.unknown;
    else if (outcomes.length && outcomeScore < .5) nextFocus='勝敗より先に、事前プランが崩れた最初の場面を1つ記録する。構築変更はその後で判断する。';
    else if (prepCount < Math.min(2,recent.length)) nextFocus='次の対戦は、選出前に「最後に残したい1体」を1行だけ記録する。';
    else if (total <= 5) nextFocus='同じ基本戦術を継続し、同じ敗因が2回出るまでは大きな構築変更を保留する。';
    else nextFocus='個人環境の上位脅威と選出実績を見て、基本選出の例外条件を1つだけ追加する。';

    return {
      total,stage,stageLabel,message,nextFocus,
      recentCount:recent.length,prepRate:recent.length?prepCount/recent.length:null,
      reviewRate:recent.length?reviewCount/recent.length:null,
      planOutcomeCount:outcomes.length,planExecutionRate:outcomeScore,
      repeatedCause,repeatedCauseCount:repeat?repeat[1]:0
    };
  }

  const SIGNAL_LABELS = {
    speed: '素早さ操作・高速展開',
    fakeout: 'ねこだまし',
    redirect: '攻撃先変更',
    trickroom: 'トリックルーム',
    priority: '先制技',
    priorityBlock: '先制技封じ',
    intimidate: 'いかく',
    antiIntimidate: 'いかく牽制',
    field: 'フィールド',
    weather: '天候',
    setup: '積み',
    hazard: '設置技',
    yawn: 'あくび',
    sleep: '眠り',
    disrupt: '妨害'
  };

  function findBaseKnowledge(name, format) {
    const target = String(name || '').trim();
    if (!target) return null;
    return BASE_KNOWLEDGE.find(row => row.names.includes(target) && row.formats.includes(format === 'single' ? 'single' : 'double')) || null;
  }

  function buildBeginnerGuide(opponentTeam, format, matches, metaNotes) {
    const mode = format === 'single' ? 'single' : 'double';
    const opponent = uniqNames(opponentTeam).slice(0, 6);
    const historyRows = aggregateOpponentPokemon((matches || []).filter(m => (m.format === 'single' ? 'single' : 'double') === mode));
    const notes = Array.isArray(metaNotes)
      ? metaNotes.filter(n=>!n?.format || (n.format==='single'?'single':'double')===mode)
      : [];
    const riskValue = { high: .95, mid: .65, low: .35 };

    const rows = opponent.map((name, index) => {
      const base = findBaseKnowledge(name, mode);
      const history = historyRows.find(r => r.name === name) || null;
      const pokemonNotes = notes.filter(n => String(n?.pokemon || '').trim() === name);
      const metaRisk = pokemonNotes.length ? Math.max(...pokemonNotes.map(n => riskValue[n.risk] || .65)) : 0;
      const components = [];
      if (base) components.push({value:base.priority, weight:.55});
      if (history) {
        const confidence = Math.min(1, (history.sampleSize || 0) / 4);
        const shrunkHistory = .45 * (1 - confidence) + history.dangerScore * confidence;
        components.push({value:shrunkHistory, weight:.30});
      }
      if (metaRisk) components.push({value:metaRisk, weight:.15});
      const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
      const score = totalWeight ? components.reduce((sum, c) => sum + c.value*c.weight, 0) / totalWeight : .2;
      const customWatch = pokemonNotes.map(n => String(n.watch || '').trim()).filter(Boolean);
      return {
        name,
        score: clamp(score, 0, 1),
        known: Boolean(base),
        role: base?.role || pokemonNotes.map(n => n.role).filter(Boolean).join(' / ') || '基本ガイド未登録',
        focus: customWatch[0] || base?.focus || '過去ログや自分のメモが増えると、この相手で優先して見る点を絞れます。',
        watch: [...(base?.watch || []), ...customWatch].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4),
        tags: [...(base?.tags || [])],
        appearances: history?.appearances || 0,
        lossRate: history?.lossRate || 0,
        noteAnswer: pokemonNotes.map(n => String(n.answer || '').trim()).filter(Boolean).join(' / '),
        originalIndex: index
      };
    }).sort((a,b) => b.score-a.score || b.appearances-a.appearances || a.originalIndex-b.originalIndex);

    const signalCounts = new Map();
    rows.forEach(r => r.tags.forEach(tag => signalCounts.set(tag, (signalCounts.get(tag) || 0) + 1)));
    const principles = [];
    const add = (tag, text) => { if ((signalCounts.get(tag) || 0) > 0 && principles.length < 4) principles.push({tag,label:SIGNAL_LABELS[tag] || tag,text}); };
    if (mode === 'double') {
      add('trickroom','トリックルームを止めるのか、張られた後を受けるのかを選出段階で決める。');
      add('speed','おいかぜ・高速アタッカーなど、行動順を相手に握られる要素を先に確認する。');
      add('fakeout','初手は片側を「ねこだまし」で止められる前提でも成立する組み合わせにする。');
      add('redirect','このゆびとまれ・いかりのこな等で集中攻撃をずらされても崩れないか確認する。');
      add('priority','終盤は先制技圏内を意識し、削れた勝ち筋を不用意に残さない。');
      add('intimidate','物理アタッカーだけに寄せると、いかくで火力を落とされ続ける可能性を確認する。');
      add('weather','天候で素早さや火力が変わる相手は、天候始動役とエースをセットで見る。');
    } else {
      add('hazard','ステルスロック等を置かれた後の交代回数まで含めて、受け回しが成立するか確認する。');
      add('yawn','あくびで交代を強制される前提で、起点にされないルートを残す。');
      add('setup','一度積まれてから止める手段があるかを選出前に確認する。');
      add('priority','終盤の先制技圏内を意識し、削れたエースを残すだけで安心しない。');
      add('speed','スカーフや高速アタッカーを含め、上から処理できるという思い込みを避ける。');
    }

    const unknown = rows.filter(r => !r.known).map(r => r.name);
    return {
      format: mode,
      version: BASE_KNOWLEDGE_VERSION,
      priorities: rows.slice(0, Math.min(3, rows.length)),
      all: rows,
      principles,
      unknown,
      coverage: opponent.length ? (opponent.length - unknown.length) / opponent.length : 0
    };
  }


  function buildSelectionAssist(opponentTeam, ownTeam, matches, metaNotes, format, teamPlan) {
    const mode = format === 'single' ? 'single' : 'double';
    const opponent = uniqNames(opponentTeam).slice(0, 6);
    const own = uniqNames(ownTeam).slice(0, 6);
    const list = sortedMatches(matches || []).filter(m => (m.format === 'single' ? 'single' : 'double') === mode);
    const notes = Array.isArray(metaNotes) ? metaNotes : [];
    const pickCount = mode === 'single' ? 3 : 4;
    const threatRows = aggregateOpponentPokemon(list);
    const ownRows = aggregateOwnSelections(list);
    const beginnerGuide = buildBeginnerGuide(opponent, format, list, notes);
    const teamFoundation = buildTeamFoundation(own, format, teamPlan);

    const riskValue = { high: 0.9, mid: 0.6, low: 0.3 };
    const noteByPokemon = new Map();
    for (const note of notes) {
      const name = String(note?.pokemon || '').trim();
      if (!name) continue;
      if (!noteByPokemon.has(name)) noteByPokemon.set(name, []);
      noteByPokemon.get(name).push(note);
    }

    const threats = opponent.map(name => {
      const history = threatRows.find(r => r.name === name) || null;
      const pokemonNotes = noteByPokemon.get(name) || [];
      const noteRisk = pokemonNotes.length ? Math.max(...pokemonNotes.map(n => riskValue[n.risk] || 0.6)) : 0;
      const guideRow = beginnerGuide.all.find(r => r.name === name) || null;
      const baseRisk = guideRow?.known ? guideRow.score : 0;
      const values = [];
      if (history) values.push({value:history.dangerScore,weight:.35});
      if (noteRisk) values.push({value:noteRisk,weight:.25});
      if (baseRisk) values.push({value:baseRisk,weight:.40});
      const denom = values.reduce((sum,v)=>sum+v.weight,0);
      const score = denom ? values.reduce((sum,v)=>sum+v.value*v.weight,0)/denom : 0.2;
      return {
        name,
        score,
        baseRole: guideRow?.role || '',
        baseFocus: guideRow?.focus || '',
        baseWatch: guideRow?.watch || [],
        baseKnown: Boolean(guideRow?.known),
        appearances: history?.appearances || 0,
        lossRate: history?.lossRate || 0,
        sampleSize: history?.sampleSize || 0,
        risk: pokemonNotes[0]?.risk || '',
        watch: pokemonNotes.map(n => n.watch).filter(Boolean).join(' / '),
        answer: pokemonNotes.map(n => n.answer).filter(Boolean).join(' / '),
        hasNote: pokemonNotes.length > 0,
        hasAnswer: pokemonNotes.some(n => String(n.answer || '').trim())
      };
    }).sort((a, b) => b.score - a.score || b.appearances - a.appearances);

    const candidates = own.map((name, index) => {
      const explicitFor = [];
      for (const opp of opponent) {
        const oppNotes = noteByPokemon.get(opp) || [];
        if (oppNotes.some(n => String(n.answer || '').includes(name))) explicitFor.push(opp);
      }

      let weightedSamples = 0;
      let weightedWins = 0;
      let relevantMatches = 0;
      const relevantOpponentNames = new Set();
      for (const m of list) {
        if (!uniqNames(m.selectedTeam).includes(name)) continue;
        const matchOpp = uniqNames(m.opponentTeam);
        const overlap = opponent.filter(o => matchOpp.includes(o));
        if (!overlap.length) continue;
        const weight = overlap.length / Math.max(1, opponent.length);
        weightedSamples += weight;
        if (m.result === 'win') weightedWins += weight;
        relevantMatches += 1;
        overlap.forEach(o => relevantOpponentNames.add(o));
      }

      const matchupRate = weightedSamples > 0 ? (weightedWins + 1) / (weightedSamples + 2) : 0.5;
      const overall = ownRows.find(r => r.name === name) || null;
      const overallRate = overall ? (overall.wins + 1) / (overall.picks + 2) : 0.5;
      let score = 50;
      score += Math.min(24, explicitFor.length * 12);
      if (weightedSamples > 0) score += (matchupRate - 0.5) * 30;
      if (overall) score += (overallRate - 0.5) * 10;
      score = Math.round(clamp(score, 0, 100));

      const evidencePoints = explicitFor.length * 3 + Math.min(4, relevantMatches) + (overall ? Math.min(2, Math.floor(overall.picks / 3) + 1) : 0);
      const evidenceLevel = evidencePoints >= 6 ? 'high' : evidencePoints >= 3 ? 'mid' : evidencePoints > 0 ? 'low' : 'none';
      const reasons = [];
      if (explicitFor.length) reasons.push(`対策メモで ${explicitFor.join(' / ')} への回答に指定`);
      if (relevantMatches) reasons.push(`今回と共通する相手への選出ログ ${relevantMatches}件`);
      if (overall) reasons.push(`全体で${overall.picks}回選出・${pct(overall.winRate)}%`);
      if (!reasons.length) reasons.push('この相手に対する根拠データはまだありません');

      return {
        name,
        score,
        evidenceLevel,
        evidencePoints,
        explicitFor,
        relevantMatches,
        relevantOpponentCount: relevantOpponentNames.size,
        matchupRate,
        overallPicks: overall?.picks || 0,
        overallWinRate: overall?.winRate || 0,
        reasons,
        originalIndex: index
      };
    }).sort((a, b) => b.score - a.score || b.evidencePoints - a.evidencePoints || a.originalIndex - b.originalIndex);

    const evidenceAvailable = candidates.some(c => c.explicitFor.length > 0 || c.relevantMatches > 0);
    let recommendationSource = 'none';
    let recommended = [];
    if (evidenceAvailable) {
      recommended = candidates.slice(0, Math.min(pickCount, candidates.length)).map(c => c.name);
      recommendationSource = 'personal';
    } else if (teamFoundation.basicSelection.length === pickCount) {
      recommended = [...teamFoundation.basicSelection];
      recommendationSource = 'starter';
    }

    const minOverlap = opponent.length >= 4 ? 2 : 1;
    const pastFailures = list.filter(m => m.result === 'loss').map(m => {
      const matchOpp = uniqNames(m.opponentTeam);
      const overlap = opponent.filter(o => matchOpp.includes(o));
      return {
        id: m.id,
        date: m.date || '',
        overlap,
        overlapCount: overlap.length,
        selectedTeam: uniqNames(m.selectedTeam),
        cause: m.cause || 'unknown',
        keyTurn: String(m.keyTurn || ''),
        learning: String(m.learning || ''),
        selectionReason: String(m.selectionReason || '')
      };
    }).filter(r => r.overlapCount >= minOverlap)
      .sort((a, b) => b.overlapCount - a.overlapCount || (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
      .slice(0, 3);

    const warnings = [];
    if (!own.length) warnings.push('自分の構築6体を先に登録してください。');
    if (own.length && own.length < pickCount) warnings.push(`選出候補を出すには自分の構築を${pickCount}体以上登録してください。`);
    if (!opponent.length) warnings.push('相手のポケモンを入力してください。');
    if (opponent.length && own.length >= pickCount && !evidenceAvailable && recommendationSource === 'none') warnings.push('自分の構築との直接データが不足し、初期モデルでも役割判定の確信が低いため、選出候補は断定していません。');
    if (recommendationSource === 'starter') warnings.push('選出候補は個人ログではなく、構築の役割から作った初期モデルです。技・持ち物が異なる場合は基本勝ち筋を優先してください。');
    if (recommended.length && recommendationSource === 'personal') {
      const directCount = candidates.slice(0, Math.min(pickCount, candidates.length)).filter(c => c.explicitFor.length || c.relevantMatches).length;
      if (directCount < recommended.length) warnings.push(`仮候補${recommended.length}体のうち${recommended.length - directCount}体は、今回の相手への直接根拠がまだありません（※表示）。`);
    }

    return {
      format: format === 'single' ? 'single' : 'double',
      pickCount,
      opponent,
      own,
      threats,
      candidates,
      recommended,
      evidenceAvailable,
      pastFailures,
      warnings,
      beginnerGuide,
      teamFoundation,
      recommendationSource
    };
  }

  function validateMatch(match) {
    const errors = [];
    if (!match) return ['対戦データがありません'];
    if (!['win', 'loss'].includes(match.result)) errors.push('勝敗を選択してください');
    const opponent = uniqNames(match.opponentTeam);
    const selected = uniqNames(match.selectedTeam);
    const maxSelected = match.format === 'single' ? 3 : 4;
    if (!opponent.length) errors.push('相手のポケモンを1匹以上入力してください');
    if (opponent.length > 6) errors.push('相手のポケモンは6匹までです');
    if (!selected.length) errors.push('自分の選出を1匹以上入力してください');
    if (selected.length > maxSelected) errors.push(`自分の選出は${maxSelected}匹までです`);
    return errors;
  }


  // ---- v0.5 catalog / beginner team builder ---------------------------------
  // Catalog is loaded from pokemon-data.js in the browser. Functions accept an
  // explicit catalog too so they remain deterministic and unit-testable.
  const TYPE_NAMES = ['ノーマル','ほのお','みず','でんき','くさ','こおり','かくとう','どく','じめん','ひこう','エスパー','むし','いわ','ゴースト','ドラゴン','あく','はがね','フェアリー'];
  const META_PRIOR_VERSION='Regulation M-C / public data 2026-09-09–14';
  const META_PRIOR_DOUBLE={rillaboom:10,sneasler:10,salamence:9,incineroar:9,kingambit:8,indeedee:8,indeedeef:8,basculegion:8,basculegionf:7,golisopod:8,farigiraf:7,pelipper:7,archaludon:6,sylveon:6,gholdengo:6,arcaninehisui:6,charizard:5,garchomp:5,whimsicott:5,volcarona:5,torkoal:5,raichu:4,gardevoir:4,baxcalibur:4,sinistcha:4};
  const META_PRIOR_SINGLE={salamence:10,garchomp:10,primarina:9,golisopod:9,hippowdon:9,baxcalibur:8,lucario:8,gholdengo:8,archaludon:8,aegislash:8,mimikyu:7,meowscarada:7,rillaboom:7,corviknight:7,gyarados:7,basculegion:7,glimmora:6,greninja:6,charizard:6,ninetalesalola:6,cinderace:6,rotomwash:6,sneasler:6,volcarona:5,hydreigon:5,pawmot:5,skeledirge:5,indeedee:5,sylveon:5,dragonite:5,metagross:5};
  function getMetaPrior(pokemon,format){if(!pokemon)return 0;const map=format==='single'?META_PRIOR_SINGLE:META_PRIOR_DOUBLE;return map[pokemon.id]||0;}
  const TYPE_EFFECT = {
    'ノーマル': {'いわ':.5,'ゴースト':0,'はがね':.5},
    'ほのお': {'ほのお':.5,'みず':.5,'くさ':2,'こおり':2,'むし':2,'いわ':.5,'ドラゴン':.5,'はがね':2},
    'みず': {'ほのお':2,'みず':.5,'くさ':.5,'じめん':2,'いわ':2,'ドラゴン':.5},
    'でんき': {'みず':2,'でんき':.5,'くさ':.5,'じめん':0,'ひこう':2,'ドラゴン':.5},
    'くさ': {'ほのお':.5,'みず':2,'くさ':.5,'どく':.5,'じめん':2,'ひこう':.5,'むし':.5,'いわ':2,'ドラゴン':.5,'はがね':.5},
    'こおり': {'ほのお':.5,'みず':.5,'くさ':2,'こおり':.5,'じめん':2,'ひこう':2,'ドラゴン':2,'はがね':.5},
    'かくとう': {'ノーマル':2,'こおり':2,'どく':.5,'ひこう':.5,'エスパー':.5,'むし':.5,'いわ':2,'ゴースト':0,'あく':2,'はがね':2,'フェアリー':.5},
    'どく': {'くさ':2,'どく':.5,'じめん':.5,'いわ':.5,'ゴースト':.5,'はがね':0,'フェアリー':2},
    'じめん': {'ほのお':2,'でんき':2,'くさ':.5,'どく':2,'ひこう':0,'むし':.5,'いわ':2,'はがね':2},
    'ひこう': {'でんき':.5,'くさ':2,'かくとう':2,'むし':2,'いわ':.5,'はがね':.5},
    'エスパー': {'かくとう':2,'どく':2,'エスパー':.5,'あく':0,'はがね':.5},
    'むし': {'ほのお':.5,'くさ':2,'かくとう':.5,'どく':.5,'ひこう':.5,'エスパー':2,'ゴースト':.5,'あく':2,'はがね':.5,'フェアリー':.5},
    'いわ': {'ほのお':2,'こおり':2,'かくとう':.5,'じめん':.5,'ひこう':2,'むし':2,'はがね':.5},
    'ゴースト': {'ノーマル':0,'エスパー':2,'ゴースト':2,'あく':.5},
    'ドラゴン': {'ドラゴン':2,'はがね':.5,'フェアリー':0},
    'あく': {'かくとう':.5,'エスパー':2,'ゴースト':2,'あく':.5,'フェアリー':.5},
    'はがね': {'ほのお':.5,'みず':.5,'でんき':.5,'こおり':2,'いわ':2,'はがね':.5,'フェアリー':2},
    'フェアリー': {'ほのお':.5,'かくとう':2,'どく':.5,'ドラゴン':2,'あく':2,'はがね':.5}
  };

  const CATALOG_INDEX_CACHE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function getCatalogIndex(catalog) {
    if(CATALOG_INDEX_CACHE && CATALOG_INDEX_CACHE.has(catalog)) return CATALOG_INDEX_CACHE.get(catalog);
    const map=new Map();
    catalog.forEach(p=>[p.id,p.name,p.en].forEach(v=>map.set(normalizeLookup(v),p)));
    if(CATALOG_INDEX_CACHE) CATALOG_INDEX_CACHE.set(catalog,map);
    return map;
  }

  function getCatalog(explicitCatalog) {
    if (Array.isArray(explicitCatalog)) return explicitCatalog;
    if (typeof globalThis !== 'undefined' && Array.isArray(globalThis.PC_POKEMON_CATALOG)) return globalThis.PC_POKEMON_CATALOG;
    return [];
  }

  function normalizeLookup(value) {
    return String(value || '').toLowerCase().normalize('NFKC').replace(/[\s・･._'’\-（）()]/g, '');
  }

  function findCatalogPokemon(value, explicitCatalog) {
    const catalog = getCatalog(explicitCatalog);
    const key = normalizeLookup(value);
    if (!key) return null;
    const index=getCatalogIndex(catalog);
    const exact=index.get(key);
    if(exact) return exact;
    // v0.4 and earlier allowed mega forms to be typed as team members. Team
    // preview in v0.5 uses the base species, so migrate those labels safely.
    const raw=String(value||'').normalize('NFKC').trim();
    let base=raw.replace(/^メガ/,'').replace(/[XYZＸＹＺ]$/i,'').replace(/^Mega\s*/i,'').replace(/[- ]Mega(?:[- ]?[XYZ])?$/i,'');
    const baseKey=normalizeLookup(base);
    if(baseKey && baseKey!==key){
      const migrated=index.get(baseKey);
      if(migrated) return migrated;
    }
    return null;
  }

  function catalogSearch(query, type, explicitCatalog) {
    const catalog = getCatalog(explicitCatalog);
    const q = normalizeLookup(query);
    return catalog.filter(p => {
      if (type && type !== 'all' && !p.types.includes(type)) return false;
      if (!q) return true;
      return [p.name,p.en,p.id,String(p.dex)].some(v => normalizeLookup(v).includes(q));
    });
  }

  function typeMultiplier(attackType, defenderTypes) {
    return (defenderTypes || []).reduce((m, d) => m * ((TYPE_EFFECT[attackType] && TYPE_EFFECT[attackType][d] != null) ? TYPE_EFFECT[attackType][d] : 1), 1);
  }

  function catalogRoleProfile(pokemon, format) {
    if (!pokemon) return {labels:[], tags:[], known:false, style:'役割を確認'};
    const [hp,atk,def,spa,spd,spe] = pokemon.stats || [0,0,0,0,0,0];
    const tags = [];
    if (spe >= 110) tags.push('fast');
    if (spe <= 60) tags.push('slow');
    if (atk >= 110 && atk >= spa + 10) tags.push('physical');
    if (spa >= 110 && spa >= atk + 10) tags.push('special');
    if (Math.max(atk,spa) >= 110) tags.push('attacker');
    if (def >= 120 || spd >= 120 || hp + def + spd >= 300) tags.push('bulky');
    const known = findTeamProfile(pokemon.name, format);
    if (known && known.known) known.tags.forEach(t => { if (!tags.includes(t)) tags.push(t); });
    const labels=[];
    if (tags.includes('fast')) labels.push('すばやい');
    if (tags.includes('physical')) labels.push('物理寄り');
    if (tags.includes('special')) labels.push('特殊寄り');
    if (tags.includes('bulky')) labels.push('耐久寄り');
    if (tags.includes('speedControl')) labels.push('素早さ補助');
    if (tags.includes('support')) labels.push('サポート');
    if (!labels.length) labels.push(Math.max(atk,spa) >= 100 ? '攻撃参加' : 'バランス');
    return {tags:[...new Set(tags)], labels:[...new Set(labels)].slice(0,3), known:!!(known && known.known), style:labels.slice(0,2).join(' / ')};
  }

  function teamTypePressure(team, explicitCatalog) {
    const mons=uniqNames(team).map(n=>findCatalogPokemon(n,explicitCatalog)).filter(Boolean);
    return TYPE_NAMES.map(type => {
      let weak=0,resist=0,immune=0;
      mons.forEach(p=>{const m=typeMultiplier(type,p.types);if(m>1)weak++;else if(m===0)immune++;else if(m<1)resist++;});
      return {type,weak,resist,immune,net:weak-resist-immune*1.25};
    }).sort((a,b)=>b.net-a.net || b.weak-a.weak || a.type.localeCompare(b.type,'ja'));
  }

  function teamCatalogSummary(team, format, explicitCatalog) {
    const mons=uniqNames(team).map(n=>findCatalogPokemon(n,explicitCatalog)).filter(Boolean);
    const profiles=mons.map(p=>catalogRoleProfile(p,format));
    const countTag=t=>profiles.filter(r=>r.tags.includes(t)).length;
    const weaknesses=teamTypePressure(mons.map(p=>p.name),explicitCatalog).filter(x=>x.weak>=2 && x.net>0).slice(0,4);
    return {mons, profiles, weaknesses, counts:{fast:countTag('fast'),physical:countTag('physical'),special:countTag('special'),bulky:countTag('bulky'),support:countTag('support'),speedControl:countTag('speedControl')}};
  }

  function scoreStarterCandidate(candidate, currentTeam, format, explicitCatalog, prepared) {
    const catalog=getCatalog(explicitCatalog);
    const current=prepared?.current || uniqNames(currentTeam).map(n=>findCatalogPokemon(n,catalog)).filter(Boolean);
    if (!candidate || current.some(p=>p.id===candidate.id || p.dex===candidate.dex)) return {score:-Infinity,reasons:['同じ種族は重ねません']};
    const summary=prepared?.summary || teamCatalogSummary(current.map(p=>p.name),format,catalog);
    const profile=catalogRoleProfile(candidate,format);
    let score=0; const reasons=[];
    summary.weaknesses.slice(0,3).forEach(w=>{
      const mult=typeMultiplier(w.type,candidate.types);
      if(mult===0){score+=15;reasons.push(`${w.type}を無効化`);} else if(mult<1){score+=10;reasons.push(`${w.type}を半減`);} else if(mult>1){score-=7;}
    });
    const need=[['fast','高速枠',8],['physical','物理火力',6],['special','特殊火力',6],['bulky','耐久枠',6]];
    need.forEach(([tag,label,pts])=>{if(summary.counts[tag]===0 && profile.tags.includes(tag)){score+=pts;reasons.push(`${label}を補う`);}});
    if(format==='double' && summary.counts.support===0 && profile.tags.includes('support')){score+=7;reasons.push('サポート役を補う');}
    if(format==='double' && summary.counts.speedControl===0 && profile.tags.includes('speedControl')){score+=9;reasons.push('素早さ操作を補う');}
    const existingTypes=new Set(current.flatMap(p=>p.types));
    const typeCounts={};current.flatMap(p=>p.types).forEach(t=>typeCounts[t]=(typeCounts[t]||0)+1);
    const fresh=candidate.types.filter(t=>!existingTypes.has(t)).length;
    score+=fresh*2;
    candidate.types.forEach(t=>{if((typeCounts[t]||0)>=2)score-=5;});
    if(fresh) reasons.push('タイプの偏りを減らす');
    if(profile.known){score+=3;reasons.push('役割を説明しやすい');}
    const metaPrior=getMetaPrior(candidate,format); if(metaPrior){score+=metaPrior*.65;if(metaPrior>=7)reasons.push('現行環境で採用例が多い');}
    const [hp,atk,def,spa,spd,spe]=candidate.stats;
    const bst=hp+atk+def+spa+spd+spe;
    score += Math.max(-4,Math.min(8,(bst-500)/20));
    // A small stability bonus. It is deliberately weaker than complement logic.
    if(Math.max(def,spd)>=110 && hp>=70) score+=2;
    if(spe>=100) score+=1;
    return {score,reasons:[...new Set(reasons)].slice(0,3),profile};
  }

  function suggestPartners(anchorOrTeam, format, limit, explicitCatalog, unowned) {
    const catalog=getCatalog(explicitCatalog);
    const currentNames=uniqNames(anchorOrTeam);
    const blocked=normalizeUnowned(unowned,catalog);
    const current=currentNames.map(n=>findCatalogPokemon(n,catalog)).filter(Boolean);
    const summary=teamCatalogSummary(current.map(p=>p.name),format,catalog);
    const prepared={current,summary};
    const n=Math.max(1,Math.min(20,Number(limit)||8));
    return catalog.filter(p=>!blocked.has(p.id)).map(p=>({pokemon:p,...scoreStarterCandidate(p,currentNames,format,catalog,prepared)}))
      .filter(x=>Number.isFinite(x.score))
      .sort((a,b)=>b.score-a.score || b.pokemon.stats.reduce((s,v)=>s+v,0)-a.pokemon.stats.reduce((s,v)=>s+v,0) || a.pokemon.dex-b.pokemon.dex)
      .slice(0,n);
  }

  function completeStarterTeam(team, format, explicitCatalog, unowned) {
    const catalog=getCatalog(explicitCatalog);
    const blocked=normalizeUnowned(unowned,catalog);
    const initial=uniqNames(team).map(n=>findCatalogPokemon(n,catalog)).filter(p=>p && !blocked.has(p.id));
    const members=[]; const dexSeen=new Set();
    initial.forEach(p=>{if(members.length<6 && !dexSeen.has(p.dex)){members.push(p.name);dexSeen.add(p.dex);}});
    const steps=[];
    while(members.length<6){
      const pick=suggestPartners(members,format,12,catalog,[...blocked]).find(x=>!dexSeen.has(x.pokemon.dex));
      if(!pick) break;
      members.push(pick.pokemon.name); dexSeen.add(pick.pokemon.dex);
      steps.push({name:pick.pokemon.name,reasons:pick.reasons,score:pick.score});
    }
    return {members,steps,warnings:members.length===6?[]:['6体まで自動補完できませんでした。']};
  }

  function buildStarterTeam(anchor, format, explicitCatalog, unowned) {
    const catalog=getCatalog(explicitCatalog);
    const first=findCatalogPokemon(anchor,catalog);
    if(!first) return {members:[],steps:[],warnings:['好きなポケモンを1体選んでください。']};
    if(normalizeUnowned(unowned,catalog).has(first.id)) return {members:[],steps:[],warnings:[`${first.name}は未所持として登録されています。`]};
    const built=completeStarterTeam([first.name],format,catalog,unowned);
    return {...built,anchor:first.name};
  }

  function validateCatalogTeam(team, explicitCatalog) {
    const catalog=getCatalog(explicitCatalog), names=uniqNames(team), errors=[];
    if(names.length>6) errors.push('構築は6体までです');
    const resolved=names.map(n=>findCatalogPokemon(n,catalog));
    const unknown=names.filter((n,i)=>!resolved[i]);
    if(unknown.length) errors.push(`未登録のポケモン: ${unknown.join(' / ')}`);
    const dexSeen=new Set(); const dup=[];
    resolved.filter(Boolean).forEach(p=>{if(dexSeen.has(p.dex))dup.push(p.name);dexSeen.add(p.dex);});
    if(dup.length) errors.push(`同じ種族の別フォームを同時には登録できません: ${dup.join(' / ')}`);
    return errors;
  }


  // ---- v0.6 ownership / starter training ------------------------------------
  const STAT_POINT_KEYS = ['HP','こうげき','ぼうぎょ','とくこう','とくぼう','すばやさ'];
  const STARTER_NATURES = ['ようき','いじっぱり','おくびょう','ひかえめ','ゆうかん','れいせい','わんぱく','ずぶとい','しんちょう','おだやか'];
  const CUSTOM_ITEM_LABELS = {
    2559:'ピクシー用メガストーン',2560:'ウツボット用メガストーン',2561:'スターミー用メガストーン',2562:'カイリュー用メガストーン',2563:'メガニウム用メガストーン',2564:'オーダイル用メガストーン',2565:'エアームド用メガストーン',2566:'ユキメノコ用メガストーン',2569:'エンブオー用メガストーン',2571:'ペンドラー用メガストーン',2572:'ズルズキン用メガストーン',2573:'シビルドン用メガストーン',2574:'シャンデラ用メガストーン',2575:'ブリガロン用メガストーン',2576:'マフォクシー用メガストーン',2578:'カエンジシ用メガストーン',2579:'フラエッテ用メガストーン',2580:'カラマネロ用メガストーン',2581:'ガメノデス用メガストーン',2582:'ドラミドロ用メガストーン',2583:'ルチャブル用メガストーン',2585:'ジジーロン用メガストーン',2587:'タイレーツ用メガストーン',2635:'ライチュウ用メガストーンX',2636:'ライチュウ用メガストーンY',2637:'チリーン用メガストーン',2638:'アブソル用メガストーンZ',2639:'ムクホーク用メガストーン',2640:'ガブリアス用メガストーンZ',2641:'ルカリオ用メガストーンZ',2642:'ゴルーグ用メガストーン',2643:'ニャオニクス用メガストーン',2644:'ケケンカニ用メガストーン',2645:'グソクムシャ用メガストーン',2647:'スコヴィラン用メガストーン',2648:'セグレイブ用メガストーン',2650:'キラフロル用メガストーン'
  };

  function normalizeUnowned(values, explicitCatalog) {
    const catalog=getCatalog(explicitCatalog), out=new Set();
    (Array.isArray(values)?values:uniqNames(values)).forEach(v=>{
      const mon=findCatalogPokemon(v,catalog); if(mon) out.add(mon.id); else if(catalog.some(p=>p.id===String(v))) out.add(String(v));
    });
    return out;
  }

  function statPointSpread(pokemon, format) {
    const p=typeof pokemon==='string'?findCatalogPokemon(pokemon):pokemon;
    if(!p) return null;
    const [hp,atk,def,spa,spd,spe]=p.stats;
    const profile=catalogRoleProfile(p,format);
    const physical=atk>=spa+8 || profile.tags.includes('physical');
    const special=spa>=atk+8 || profile.tags.includes('special');
    const fast=spe>=100 || profile.tags.includes('fast');
    const slow=spe<=60 || profile.tags.includes('slow');
    const bulky=profile.tags.includes('bulky');
    const support=profile.tags.includes('support');
    const trickroom=profile.tags.includes('trickroom');
    const points={HP:0,'こうげき':0,'ぼうぎょ':0,'とくこう':0,'とくぼう':0,'すばやさ':0};
    let nature=''; let explanation='';
    if(support && bulky && !trickroom){
      points.HP=32;
      if(def<=spd){points['ぼうぎょ']=32;points['とくぼう']=2;nature=spa>=atk?'ずぶとい':'わんぱく';}
      else {points['とくぼう']=32;points['ぼうぎょ']=2;nature=spa>=atk?'おだやか':'しんちょう';}
      explanation='支援役として場に残りやすくするため、HPと低い方の耐久を補うスターター配分です。';
    }
    else if(physical && fast){points['こうげき']=32;points['すばやさ']=32;points.HP=2;nature='ようき';explanation='物理火力と行動順を優先する、分かりやすい高速型です。';}
    else if(special && fast){points['とくこう']=32;points['すばやさ']=32;points.HP=2;nature='おくびょう';explanation='特殊火力と行動順を優先する、分かりやすい高速型です。';}
    else if(physical && trickroom){points.HP=32;points['こうげき']=32;points['とくぼう']=2;nature='ゆうかん';explanation='トリックルーム下での行動を想定し、素早さを上げずに耐久と物理火力を優先します。';}
    else if(special && trickroom){points.HP=32;points['とくこう']=32;points['ぼうぎょ']=2;nature='れいせい';explanation='トリックルーム下での行動を想定し、素早さを上げずに耐久と特殊火力を優先します。';}
    else if(physical){points.HP=32;points['こうげき']=32;points['すばやさ']=2;nature='いじっぱり';explanation=slow?'低速でも素早さ下降を決め打ちせず、まず耐久と物理火力を伸ばすスターター配分です。':'まず耐久と物理火力を最大まで伸ばすスターター配分です。';}
    else if(special){points.HP=32;points['とくこう']=32;points['すばやさ']=2;nature='ひかえめ';explanation=slow?'低速でも素早さ下降を決め打ちせず、まず耐久と特殊火力を伸ばすスターター配分です。':'まず耐久と特殊火力を最大まで伸ばすスターター配分です。';}
    else if(bulky || Math.max(def,spd)>=110){
      points.HP=32;
      if(def<=spd){points['ぼうぎょ']=32;points['とくぼう']=2;nature=spa>=atk?'ずぶとい':'わんぱく';}
      else {points['とくぼう']=32;points['ぼうぎょ']=2;nature=spa>=atk?'おだやか':'しんちょう';}
      explanation='HPと低い方の耐久を補い、まず場に残りやすくする配分です。';
    } else {
      const offense=atk>=spa?'こうげき':'とくこう'; points[offense]=32; points['すばやさ']=32; points.HP=2;
      nature=atk>=spa?'ようき':'おくびょう'; explanation='役割が固まる前は、主な攻撃能力と素早さを伸ばして試しやすくします。';
    }
    return {points,nature,explanation,total:Object.values(points).reduce((a,b)=>a+b,0)};
  }

  function normalizeMetaEntry(meta) {
    if(!meta || typeof meta!=='object') return null;
    const moves=(meta.moves||[]).map(x=>typeof x==='string'?{name:x,usage:null}:x).filter(x=>x&&x.name).slice(0,6);
    const items=(meta.items||[]).map(x=>typeof x==='string'?{name:x,usage:null}:x).filter(x=>x&&x.name).slice(0,6);
    const rawPoints=meta.statPoints&&typeof meta.statPoints==='object'?meta.statPoints:null;
    const statPoints=rawPoints?Object.fromEntries(STAT_POINT_KEYS.map(k=>[k,Math.max(0,Math.min(32,Number(rawPoints[k])||0))])):null;
    const statPointTotal=statPoints?Object.values(statPoints).reduce((a,b)=>a+b,0):0;
    return {
      usage:Number(meta.usage)||0,
      moves,
      items,
      updatedAt:meta.updatedAt||'',
      nature:STARTER_NATURES.includes(meta.nature)?meta.nature:'',
      statPoints:statPointTotal===66?statPoints:null,
      statExplanation:typeof meta.statExplanation==='string'?meta.statExplanation:'',
      source:typeof meta.source==='string'?meta.source:''
    };
  }

  function starterItemCandidates(pokemon, format, meta) {
    const entry=normalizeMetaEntry(meta), profile=catalogRoleProfile(pokemon,format), out=[];
    if(entry) entry.items.forEach(x=>{if(!out.includes(x.name))out.push(x.name);});
    const attacker=profile.tags.includes('attacker')||Math.max(pokemon.stats[1],pokemon.stats[3])>=105;
    const fast=profile.tags.includes('fast')||pokemon.stats[5]>=100;
    const bulky=profile.tags.includes('bulky');
    const fallback=attacker?(fast?['いのちのたま','きあいのタスキ','こだわりスカーフ','オボンのみ']:['いのちのたま','オボンのみ','たべのこし','きあいのタスキ']):(bulky?['たべのこし','オボンのみ','ゴツゴツメット','メンタルハーブ']:['オボンのみ','きあいのタスキ','たべのこし','ゴツゴツメット']);
    fallback.forEach(x=>{if(!out.includes(x))out.push(x);});
    return out.slice(0,6);
  }

  function buildStarterTrainingSet(pokemon, format, meta) {
    const p=typeof pokemon==='string'?findCatalogPokemon(pokemon):pokemon;
    if(!p) return null;
    const entry=normalizeMetaEntry(meta), spread=statPointSpread(p,format), items=starterItemCandidates(p,format,entry);
    const moves=entry?entry.moves.slice(0,4):[];
    const points=entry?.statPoints||spread.points;
    const nature=entry?.nature||spread.nature;
    const statExplanation=entry?.statExplanation||spread.explanation;
    const dataStrength=entry&&entry.moves.length>=3&&entry.items.length
      ? (format==='single'?'現行シングル育成例':'実戦データあり')
      : '実戦データ不足';
    return {
      pokemon:p.name,id:p.id,nature,
      statPoints:points,
      statPointTotal:Object.values(points).reduce((a,b)=>a+b,0),
      statExplanation,
      item:items[0]||'',
      itemAlternatives:items.slice(1,4),
      moves,
      usage:entry?.usage||0,
      dataStrength,
      source:entry?.source||(entry?'Reg M-C実戦データ＋スターター配分':'スターター配分')
    };
  }

  function buildTeamStarterSets(team, format, metaById, explicitCatalog) {
    const catalog=getCatalog(explicitCatalog), usedItems=new Set();
    return uniqNames(team).map(name=>findCatalogPokemon(name,catalog)).filter(Boolean).map(p=>{
      const rawMeta=metaById?.[p.id]||metaById?.[p.en]||null;
      const set=buildStarterTrainingSet(p,format,rawMeta);
      const candidates=[set.item,...set.itemAlternatives,...starterItemCandidates(p,format,rawMeta)].filter(Boolean);
      const chosen=candidates.find(x=>!usedItems.has(x))||set.item||'';
      if(chosen) usedItems.add(chosen);
      const changed=chosen!==set.item && !!set.item;
      return {...set,item:chosen,itemAdjustedForClause:changed,itemAlternatives:candidates.filter(x=>x!==chosen).slice(0,3)};
    });
  }

  function scoreReplacementCandidate(candidate, target, remainingTeam, format, explicitCatalog, unowned) {
    const catalog=getCatalog(explicitCatalog), blocked=normalizeUnowned(unowned,catalog);
    if(!candidate || blocked.has(candidate.id)) return {score:-Infinity,reasons:['未所持として除外']};
    const base=scoreStarterCandidate(candidate,remainingTeam,format,catalog);
    if(!Number.isFinite(base.score)) return base;
    const tp=catalogRoleProfile(target,format), cp=catalogRoleProfile(candidate,format);
    const shared=cp.tags.filter(t=>tp.tags.includes(t));
    let score=base.score+shared.length*5;
    const commonTypes=candidate.types.filter(t=>target.types.includes(t)); score+=commonTypes.length*2;
    const reasons=[...base.reasons];
    if(shared.length) reasons.unshift(`役割が近い: ${cp.labels.join('・')}`);
    if(commonTypes.length) reasons.push(`${commonTypes.join('/')}タイプを維持`);
    return {score,reasons:[...new Set(reasons)].slice(0,4),profile:cp};
  }

  function suggestReplacements(targetValue, team, format, limit, explicitCatalog, unowned) {
    const catalog=getCatalog(explicitCatalog), target=findCatalogPokemon(targetValue,catalog);
    if(!target) return [];
    const blocked=normalizeUnowned([...(Array.isArray(unowned)?unowned:[]),target.id],catalog);
    const remaining=uniqNames(team).filter(n=>findCatalogPokemon(n,catalog)?.dex!==target.dex);
    const n=Math.max(1,Math.min(12,Number(limit)||5));
    return catalog.map(p=>({pokemon:p,...scoreReplacementCandidate(p,target,remaining,format,catalog,[...blocked])}))
      .filter(x=>Number.isFinite(x.score))
      .sort((a,b)=>b.score-a.score || a.pokemon.dex-b.pokemon.dex).slice(0,n);
  }

  return {
    CAUSE_LABELS,
    clamp,
    uniqNames,
    pct,
    calculateStats,
    aggregateOpponentPokemon,
    aggregateOwnSelections,
    analyzeMatch,
    findBaseKnowledge,
    buildBeginnerGuide,
    findTeamProfile,
    buildTeamFoundation,
    buildProgressSnapshot,
    buildSelectionAssist,
    validateMatch,
    BASE_KNOWLEDGE_VERSION,
    PLAN_OUTCOME_LABELS,
    TYPE_NAMES,
    META_PRIOR_VERSION,
    getMetaPrior,
    findCatalogPokemon,
    catalogSearch,
    typeMultiplier,
    catalogRoleProfile,
    teamTypePressure,
    teamCatalogSummary,
    scoreStarterCandidate,
    suggestPartners,
    buildStarterTeam,
    completeStarterTeam,
    validateCatalogTeam,
    STAT_POINT_KEYS,
    STARTER_NATURES,
    CUSTOM_ITEM_LABELS,
    normalizeUnowned,
    statPointSpread,
    buildStarterTrainingSet,
    buildTeamStarterSets,
    suggestReplacements
  };
});
