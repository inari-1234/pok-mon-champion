from pathlib import Path
from bs4 import BeautifulSoup

base = Path("ui-v0.8-beginner-preview")
html = (base / "index.html").read_text(encoding="utf-8")
js = (base / "app.js").read_text(encoding="utf-8")
css = (base / "styles.css").read_text(encoding="utf-8")
soup = BeautifulSoup(html, "html.parser")

required_screens = {
    "welcome","coach-home","starter","team-proposal","missing",
    "training","battle-ready","battle-input","battle-coach","review"
}
found_screens = {node.get("data-screen") for node in soup.select("[data-screen]")}
missing_screens = required_screens - found_screens
assert not missing_screens, f"missing screens: {sorted(missing_screens)}"

required_ids = [
    "backButton","homeProgressBar","homeNextButton","starterSelected",
    "teamGrid","missingGrid","replacementBox","trainImage","trainName",
    "trainingDoneButton","opponentGrid","analyzeButton","battlePicks",
    "lossQuestions","reviewDone","pokemonPicker","pickerGrid"
]
for item in required_ids:
    assert soup.find(id=item), f"missing id: {item}"

required_flow = [
    'data-next="starter"',
    'data-next="team-proposal"',
    'data-next="training"',
    'data-next="battle-input"',
    'data-next="review"',
    'data-next="coach-home"'
]
for token in required_flow:
    assert token in html, f"missing flow token: {token}"

for function_name in [
    "showScreen","renderCoachHome","chooseStarter","renderTeam",
    "renderMissing","renderTraining","renderOpponent","renderBattleCoach"
]:
    assert function_name in js, f"missing JS function: {function_name}"

for term in ["能力ポイント","持っていないポケモン","まず、これだけ見ればOKです。"]:
    assert term in html, f"missing beginner-facing copy: {term}"

assert "safe-area-inset-top" in css
assert "safe-area-inset-bottom" in css
assert "@media" in css
print("ui-v0.8 beginner static check PASS")