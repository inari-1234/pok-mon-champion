(() => {
  const pokemon = [
    {id:149,name:"カイリュー",role:"扱いやすいエース",nature:"いじっぱり",item:"いかさまダイス",points:"攻撃32 / 素早さ32 / HP2",moves:"しんそく / スケイルショット / じしん / りゅうのまい"},
    {id:445,name:"ガブリアス",role:"物理アタッカー",nature:"ようき",item:"こだわりスカーフ",points:"攻撃32 / 素早さ32 / HP2",moves:"じしん / ドラゴンクロー / アイアンヘッド / ステルスロック"},
    {id:1000,name:"サーフゴー",role:"特殊アタッカー",nature:"おくびょう",item:"こだわりメガネ",points:"特攻32 / 素早さ32 / HP2",moves:"ゴールドラッシュ / シャドーボール / きあいだま / トリック"},
    {id:987,name:"ハバタクカミ",role:"高速特殊アタッカー",nature:"おくびょう",item:"ブーストエナジー",points:"特攻32 / 素早さ32 / HP2",moves:"ムーンフォース / シャドーボール / マジカルフレイム / ちょうはつ"},
    {id:892,name:"ウーラオス",role:"物理アタッカー",nature:"ようき",item:"こだわりハチマキ",points:"攻撃32 / 素早さ32 / HP2",moves:"すいりゅうれんだ / インファイト / アクアジェット / とんぼがえり"},
    {id:645,name:"ランドロス",role:"相手を崩す補助役",nature:"わんぱく",item:"オボンのみ",points:"HP32 / 防御32 / 素早さ2",moves:"じしん / とんぼがえり / ステルスロック / ちょうはつ"},
    {id:248,name:"バンギラス",role:"耐久と攻撃",nature:"いじっぱり",item:"とつげきチョッキ",points:"HP32 / 攻撃32 / 特防2",moves:"ストーンエッジ / かみくだく / じしん / れいとうパンチ"},
    {id:212,name:"ハッサム",role:"先制技アタッカー",nature:"いじっぱり",item:"オボンのみ",points:"HP32 / 攻撃32 / 防御2",moves:"バレットパンチ / とんぼがえり / インファイト / つるぎのまい"},
    {id:245,name:"スイクン",role:"耐久役",nature:"ずぶとい",item:"たべのこし",points:"HP32 / 防御32 / 特防2",moves:"ねっとう / れいとうビーム / めいそう / まもる"}
  ];
  const byName = {};
  pokemon.forEach(function(p){ byName[p.name] = p; });
  function sprite(id){ return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/" + id + ".png"; }

  let starter = byName["ガブリアス"];
  let team = ["ガブリアス","サーフゴー","カイリュー","ハバタクカミ","ウーラオス","ランドロス"];
  let trainingIndex = 0;
  let opponent = [];
  let stage = 1;
  const history = [];
  const screens = Array.from(document.querySelectorAll(".screen"));
  const backButton = document.getElementById("backButton");
  const miniHome = document.getElementById("miniHome");
  const picker = document.getElementById("pokemonPicker");
  const pickerGrid = document.getElementById("pickerGrid");
  const pickerTitle = document.getElementById("pickerTitle");
  let pickerMode = "starter";
  let opponentSlot = 0;

  function activeScreen(){
    const screen = screens.find(function(s){ return s.classList.contains("active"); });
    return screen ? screen.dataset.screen : "welcome";
  }

  function showScreen(name, push){
    if (push === undefined) push = true;
    const current = activeScreen();
    if (push && current !== name) history.push(current);
    screens.forEach(function(s){ s.classList.toggle("active", s.dataset.screen === name); });
    backButton.hidden = name === "welcome" || name === "coach-home";
    miniHome.hidden = name === "welcome" || name === "coach-home";
    window.scrollTo({top:0,behavior:"smooth"});
    if (name === "coach-home") renderCoachHome();
    if (name === "team-proposal") renderTeam();
    if (name === "missing") renderMissing();
    if (name === "training") renderTraining();
    if (name === "battle-coach") renderBattleCoach();
  }

  document.querySelectorAll("[data-next]").forEach(function(btn){
    btn.addEventListener("click", function(){
      const target = btn.dataset.next;
      if (target === "team-proposal") stage = Math.max(stage, 2);
      if (target === "training") stage = Math.max(stage, 3);
      if (target === "battle-ready") stage = Math.max(stage, 4);
      showScreen(target);
    });
  });

  backButton.addEventListener("click", function(){
    const prev = history.pop() || "coach-home";
    showScreen(prev, false);
  });

  function renderCoachHome(){
    const widths = {1:18,2:42,3:68,4:92};
    document.getElementById("homeProgressText").textContent = "STEP " + stage + " / 4";
    document.getElementById("homeProgressBar").style.width = widths[stage] + "%";
    document.querySelectorAll(".progress-list li").forEach(function(li, idx){
      const n = idx + 1;
      li.classList.toggle("active", n === stage);
      li.classList.toggle("done", n < stage);
      const old = li.querySelector("em");
      if (old) old.remove();
      if (n === stage) {
        const mark = document.createElement("em");
        mark.textContent = "今ここ";
        li.appendChild(mark);
      }
    });
    const nextMap = {
      1:["まず、使いたいポケモンを1匹選びましょう。","強さや役割はまだ考えなくて大丈夫です。好きなポケモンや、使ってみたいポケモンでOKです。","starter"],
      2:["次は、6匹のチームを完成させましょう。","残りの5匹はアプリが仮に組みます。持っていないポケモンだけ交換すればOKです。","team-proposal"],
      3:["次は、1匹ずつ対戦用に育てましょう。","性格・持ち物・能力ポイント・技を、表示どおりに設定していきます。","training"],
      4:["準備できました。対戦を始めてみましょう。","相手6匹を入れれば、最初に見ることとおすすめ3匹を表示します。","battle-ready"]
    };
    const next = nextMap[stage];
    document.getElementById("homeNextTitle").textContent = next[0];
    document.getElementById("homeNextBody").textContent = next[1];
    document.getElementById("homeNextButton").onclick = function(){ showScreen(next[2]); };
  }

  function chooseStarter(name){
    starter = byName[name] || pokemon[0];
    const base = ["ガブリアス","サーフゴー","カイリュー","ハバタクカミ","ウーラオス","ランドロス"];
    team = [starter.name].concat(base.filter(function(n){ return n !== starter.name; })).slice(0,6);
    document.getElementById("starterImage").src = sprite(starter.id);
    document.getElementById("starterName").textContent = starter.name;
    document.getElementById("starterSelected").hidden = false;
    picker.close();
  }

  function openPicker(mode, slot){
    pickerMode = mode;
    opponentSlot = slot === undefined || slot === null ? 0 : slot;
    pickerTitle.textContent = mode === "starter" ? "使いたいポケモンを選ぶ" : "相手のポケモンを選ぶ";
    renderPicker("");
    picker.showModal();
  }

  function renderPicker(query){
    const q = (query || "").trim();
    const list = pokemon.filter(function(p){ return !q || p.name.indexOf(q) !== -1; });
    pickerGrid.innerHTML = "";
    list.forEach(function(p){
      const btn = document.createElement("button");
      btn.dataset.pokemon = p.name;
      btn.innerHTML = '<img src="' + sprite(p.id) + '" alt="' + p.name + '"><strong>' + p.name + '</strong><small>' + p.role + '</small>';
      btn.addEventListener("click", function(){
        if (pickerMode === "starter") chooseStarter(p.name);
        if (pickerMode === "opponent") {
          opponent[opponentSlot] = p.name;
          picker.close();
          renderOpponent();
        }
      });
      pickerGrid.appendChild(btn);
    });
  }

  document.querySelectorAll("[data-open-picker]").forEach(function(btn){
    btn.addEventListener("click", function(){ openPicker("starter"); });
  });
  document.getElementById("pokemonSearch").addEventListener("input", function(e){ renderPicker(e.target.value); });
  document.getElementById("closePicker").addEventListener("click", function(){ picker.close(); });

  function renderTeam(){
    const el = document.getElementById("teamGrid");
    el.innerHTML = "";
    team.forEach(function(name, idx){
      const p = byName[name] || pokemon[0];
      const div = document.createElement("div");
      div.className = "team-member";
      div.innerHTML = '<img src="' + sprite(p.id) + '" alt="' + p.name + '"><strong>' + p.name + '</strong><small>' + (idx === 0 ? "あなたが選んだ1匹" : p.role) + '</small>';
      el.appendChild(div);
    });
  }

  function renderMissing(){
    const el = document.getElementById("missingGrid");
    el.innerHTML = "";
    team.forEach(function(name){
      const p = byName[name] || pokemon[0];
      const btn = document.createElement("button");
      btn.dataset.missing = name;
      btn.innerHTML = '<img src="' + sprite(p.id) + '" alt="' + p.name + '"><strong>' + p.name + '</strong>';
      btn.addEventListener("click", function(){
        el.querySelectorAll("button").forEach(function(b){ b.classList.remove("selected"); });
        btn.classList.add("selected");
        showReplacement(name);
      });
      el.appendChild(btn);
    });
  }

  function showReplacement(name){
    const candidates = ["ハッサム","スイクン","バンギラス"].filter(function(n){ return team.indexOf(n) === -1; });
    const replacement = byName[candidates[0] || "ハッサム"];
    const box = document.getElementById("replacementBox");
    box.hidden = false;
    document.getElementById("missingName").textContent = name;
    document.getElementById("replacementImage").src = sprite(replacement.id);
    document.getElementById("replacementName").textContent = replacement.name;
    document.getElementById("replacementReason").textContent = name + "と完全に同じではありませんが、役割が分かりやすく、最初のチームでも使いやすい候補です。";
    document.getElementById("replaceButton").onclick = function(){
      team = team.map(function(n){ return n === name ? replacement.name : n; });
      box.hidden = true;
      renderMissing();
    };
    box.scrollIntoView({behavior:"smooth",block:"center"});
  }

  function renderTraining(){
    if (trainingIndex > team.length - 1) trainingIndex = team.length - 1;
    const p = byName[team[trainingIndex]] || pokemon[0];
    document.getElementById("trainIndex").textContent = trainingIndex + 1;
    document.getElementById("trainBar").style.width = (((trainingIndex + 1) / team.length) * 100) + "%";
    document.getElementById("trainImage").src = sprite(p.id);
    document.getElementById("trainName").textContent = p.name;
    document.getElementById("trainNature").textContent = p.nature;
    document.getElementById("trainItem").textContent = p.item;
    document.getElementById("trainPoints").textContent = p.points;
    document.getElementById("trainMoves").textContent = p.moves;
    document.getElementById("whyBox").hidden = true;
    document.getElementById("trainingDoneButton").textContent = trainingIndex === team.length - 1 ? "6匹の育成を完了する" : "この設定でOK";
  }

  document.querySelectorAll(".why-button").forEach(function(btn){
    btn.addEventListener("click", function(){
      const box = document.getElementById("whyBox");
      box.textContent = btn.dataset.explain;
      box.hidden = false;
    });
  });

  document.getElementById("trainingDoneButton").addEventListener("click", function(){
    if (trainingIndex < team.length - 1) {
      trainingIndex += 1;
      renderTraining();
      window.scrollTo({top:0,behavior:"smooth"});
    } else {
      stage = 4;
      showScreen("battle-ready");
    }
  });

  document.querySelectorAll("#opponentGrid button").forEach(function(btn){
    btn.addEventListener("click", function(){ openPicker("opponent", Number(btn.dataset.slot)); });
  });

  function renderOpponent(){
    document.querySelectorAll("#opponentGrid button").forEach(function(btn, idx){
      const name = opponent[idx];
      if (!name) {
        btn.innerHTML = '<span>＋</span><small>' + (idx + 1) + '匹目</small>';
        return;
      }
      const p = byName[name] || pokemon[0];
      btn.innerHTML = '<img src="' + sprite(p.id) + '" alt="' + p.name + '"><strong>' + p.name + '</strong>';
    });
    document.getElementById("analyzeButton").disabled = opponent.filter(Boolean).length < 6;
  }

  document.getElementById("demoOpponentButton").addEventListener("click", function(){
    opponent = ["カイリュー","サーフゴー","ガブリアス","ハバタクカミ","ランドロス","ウーラオス"];
    renderOpponent();
  });
  document.getElementById("analyzeButton").addEventListener("click", function(){ showScreen("battle-coach"); });

  function renderBattleCoach(){
    const picks = team.slice(0,3).map(function(name){ return byName[name] || pokemon[0]; });
    const box = document.getElementById("battlePicks");
    box.innerHTML = "";
    picks.forEach(function(p){
      const div = document.createElement("div");
      div.innerHTML = '<img src="' + sprite(p.id) + '" alt="' + p.name + '"><strong>' + p.name + '</strong>';
      box.appendChild(div);
    });
    document.getElementById("leadAdvice").textContent = picks[0].name + "から出して、相手がどう動くか確認しましょう。";
  }

  document.querySelectorAll("[data-result]").forEach(function(btn){
    btn.addEventListener("click", function(){
      document.querySelectorAll("[data-result]").forEach(function(b){ b.classList.remove("selected"); });
      btn.classList.add("selected");
      const loss = btn.dataset.result === "loss";
      document.getElementById("lossQuestions").hidden = !loss;
      if (!loss) finishReview();
      else {
        document.getElementById("reviewDone").hidden = true;
        document.getElementById("finishReview").hidden = true;
      }
    });
  });

  document.querySelectorAll(".plain-options button").forEach(function(btn){
    btn.addEventListener("click", function(){
      document.querySelectorAll(".plain-options button").forEach(function(b){ b.classList.remove("selected"); });
      btn.classList.add("selected");
      finishReview();
    });
  });

  function finishReview(){
    document.getElementById("reviewDone").hidden = false;
    document.getElementById("finishReview").hidden = false;
  }

  const help = document.getElementById("helpDialog");
  document.getElementById("helpButton").addEventListener("click", function(){ help.showModal(); });
  document.getElementById("closeHelp").addEventListener("click", function(){ help.close(); });
  [picker, help].forEach(function(dialog){
    dialog.addEventListener("click", function(e){ if (e.target === dialog) dialog.close(); });
  });

  renderCoachHome();
  renderTeam();
  renderOpponent();
})();