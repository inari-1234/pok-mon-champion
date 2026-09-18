(function(root){'use strict';
const data={
  Salamence:{
    usage:0,
    moves:[{name:'すてみタックル'},{name:'りゅうのまい'},{name:'じしん'},{name:'はねやすめ'}],
    items:[{name:'ボーマンダナイト'},{name:'こだわりスカーフ'},{name:'いのちのたま'}],
    nature:'ようき',
    statPoints:{HP:2,'こうげき':32,'ぼうぎょ':0,'とくこう':0,'とくぼう':0,'すばやさ':32},
    statExplanation:'シングルの高速物理アタッカーとして、攻撃と素早さを優先するスターター配分です。',
    source:'Reg M-Cシングル実戦データ（Pokémon Zone 2026-09-17）',
    updatedAt:'2026-09-18'
  },
  Garchomp:{
    usage:0,
    moves:[{name:'げきりん'},{name:'じしん'},{name:'がんせきふうじ'},{name:'ステルスロック'}],
    items:[{name:'きあいのタスキ'},{name:'オボンのみ'},{name:'こだわりスカーフ'},{name:'ラムのみ'}],
    nature:'ようき',
    statPoints:{HP:2,'こうげき':32,'ぼうぎょ':0,'とくこう':0,'とくぼう':0,'すばやさ':32},
    statExplanation:'行動保証を活かしやすい、攻撃・素早さ重視のシングル基本配分です。',
    source:'Reg M-Cシングル育成例（Game8 2026-09-18）',
    updatedAt:'2026-09-18'
  },
  Primarina:{
    usage:0,
    moves:[{name:'うたかたのアリア'},{name:'ムーンフォース'},{name:'クイックターン'},{name:'アクアジェット'}],
    items:[{name:'オボンのみ'},{name:'たべのこし'},{name:'カゴのみ'}],
    nature:'ひかえめ',
    statPoints:{HP:32,'こうげき':0,'ぼうぎょ':1,'とくこう':32,'とくぼう':1,'すばやさ':0},
    statExplanation:'HPと特攻を伸ばし、対面性能と特殊火力を両立するシングル基本配分です。',
    source:'Reg M-Cシングル育成例（Game8 2026-09-18）',
    updatedAt:'2026-09-18'
  },
  Golisopod:{
    usage:0,
    moves:[{name:'であいがしら'},{name:'ふいうち'},{name:'アクアブレイク'},{name:'まきびし'}],
    items:[{name:'オボンのみ'},{name:'グソクムシャ用メガストーン'},{name:'ゴツゴツメット'}],
    nature:'いじっぱり',
    statPoints:{HP:31,'こうげき':32,'ぼうぎょ':1,'とくこう':0,'とくぼう':2,'すばやさ':0},
    statExplanation:'先制技の火力を最大化しつつ、ききかいひの発動タイミングも意識したシングル配分です。',
    source:'Reg M-Cシングル育成例（Game8 2026-09-17）',
    updatedAt:'2026-09-18'
  },
  Hippowdon:{
    usage:0,
    moves:[{name:'じしん'},{name:'あくび'},{name:'ふきとばし'},{name:'ステルスロック'}],
    items:[{name:'オボンのみ'},{name:'たべのこし'},{name:'ゴツゴツメット'}],
    nature:'しんちょう',
    statPoints:{HP:32,'こうげき':0,'ぼうぎょ':2,'とくこう':0,'とくぼう':32,'すばやさ':0},
    statExplanation:'ステルスロック＋あくびを安定して展開するため、HPと特防を優先するシングル基本配分です。',
    source:'Reg M-Cシングル育成例（Game8 2026-09-17）',
    updatedAt:'2026-09-18'
  },
  Meowscarada:{
    usage:0,
    moves:[{name:'トリックフラワー'},{name:'はたきおとす'},{name:'ふいうち'},{name:'ちょうはつ'}],
    items:[{name:'きあいのタスキ'},{name:'こだわりスカーフ'},{name:'いのちのたま'}],
    nature:'いじっぱり',
    statPoints:{HP:0,'こうげき':32,'ぼうぎょ':1,'とくこう':0,'とくぼう':1,'すばやさ':32},
    statExplanation:'攻撃と素早さを最大化して、対面性能と終盤の縛りを作るシングル基本配分です。',
    source:'Reg M-Cシングル育成例（Game8 2026-09-18）',
    updatedAt:'2026-09-18'
  },
  Cinderace:{
    usage:0,
    moves:[{name:'かえんボール'},{name:'とびひざげり'},{name:'ダストシュート'},{name:'ふいうち'}],
    items:[{name:'きあいのタスキ'},{name:'いのちのたま'},{name:'こだわりスカーフ'}],
    nature:'いじっぱり',
    statPoints:{HP:2,'こうげき':32,'ぼうぎょ':0,'とくこう':0,'とくぼう':0,'すばやさ':32},
    statExplanation:'攻撃と素早さを最大化し、広い技範囲を先に押し付けるシングル基本配分です。',
    source:'Reg M-Cシングル育成例（Game8 2026-09-18）',
    updatedAt:'2026-09-18'
  }
};
root.PC_SINGLE_COMPETITIVE_FALLBACK=data;
if(typeof module==='object'&&module.exports)module.exports=data;
})(typeof globalThis!=='undefined'?globalThis:this);
