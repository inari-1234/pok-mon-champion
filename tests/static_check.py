from pathlib import Path
from bs4 import BeautifulSoup
import re, json, sys
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
app=(root/'app.js').read_text()
core=(root/'core.js').read_text()
style=(root/'styles.css').read_text()
soup=BeautifulSoup(html,'html.parser')
ids=[x.get('id') for x in soup.find_all(id=True)]
assert len(ids)==len(set(ids)), 'duplicate HTML ids'
refs=set(re.findall(r"\bel\('([^']+)'\)",app))
missing=sorted(refs-set(ids))
assert not missing, f'missing DOM ids: {missing}'
assert 'innerHTML' not in app, 'unsafe innerHTML use found'
for src in ['pokemon-data.js','competitive-data.js','single-competitive-data.js','core.js','app.js']:
    assert (root/src).exists(), f'missing {src}'
    assert soup.find('script',src=src), f'index does not load {src}'
assert soup.find('link',rel='manifest'), 'manifest link missing'
json.loads((root/'manifest.webmanifest').read_text())
sw=(root/'sw.js').read_text()
assert 'champion-coach-v8.1-onboarding1' in sw
assert 'competitive-data.js' in sw
assert 'single-competitive-data.js' in sw
assert 'version.json' in sw
assert 'latest.json' in sw
assert (root/'version.json').exists(), 'version.json missing'
assert (root/'latest.json').exists(), 'latest.json missing'
latest=json.loads((root/'latest.json').read_text())
assert latest.get('version')=='0.8.1' and latest.get('sw_cache')=='champion-coach-v8.1-onboarding1', 'latest metadata mismatch'
version=json.loads((root/'version.json').read_text())
assert version.get('version')=='0.8.1', 'wrong repository build version'
assert (root/'.github/workflows/validate.yml').exists(), 'validation workflow missing'
assert (root/'.github/workflows/pages.yml').exists(), 'pages workflow missing'
assert 'data-shadow' in style and 'pokemon-grid' in style
assert 'v0.8.1' in html and 'header-text-btn' in style
assert 'あなたは今ここ' in html and 'homeCoachTitle' in html and 'homeProgressBar' in html
assert 'data-team-pane="training"' in html and 'assistDetails' in html
assert 'data-pokemon-category="recommended"' in html
assert 'data-environment-format="single"' in html
assert '残りをおまかせで仮組み' in html
assert '改行・カンマ区切り' not in html, 'manual entry guidance still visible'
assert 'buildCoachTasks' not in core
assert len(soup.find_all('script',src='core.js'))==1, 'core.js loaded more than once'
assert '持っていないポケモン' in html and '1匹ずつ育てる' in html
assert html.count('<option value="single">シングル</option><option value="double">ダブル</option>') >= 3, 'single must be the primary UI option'
assert 'bottom-nav' in html and 'hidden' in str(soup.find('nav',class_='bottom-nav')), 'legacy bottom nav must stay hidden'
assert 'v0.8 production guided cleanup' in style
assert 'starterChoicePanel' in html and 'teamComposeArea' in html
assert all(x in html for x in ['starterRecommended','starterPopular','starterAll','starterSearch'])
assert "openPokemonPicker('starter','recommended')" in app
assert "el('starterChoicePanel').hidden=hasDraft" in app
assert "el('teamComposeArea').hidden=!hasDraft" in app
assert 'sprite-placeholder' in style and "slot-img sprite-placeholder" in app
assert '<meta name="theme-color" content="#f5f8fd">' in html
assert '<meta name="apple-mobile-web-app-status-bar-style" content="default">' in html
manifest=json.loads((root/'manifest.webmanifest').read_text())
assert manifest.get('theme_color')=='#f5f8fd' and manifest.get('background_color')=='#f5f8fd'
assert 'draftMatchesSaved' in app
assert "inventory-action','未所持'" in app
assert '/sprites/pokemon/other/home/${mon.dex}.png' in app
assert 'trainingComplete' in app
assert '育成を確認して対戦へ' in app
assert 'sprite-fallback' in app and '${cls} sprite-fallback' in app
assert all(ch not in html for ch in ['⚙','⌂','◇','⚔','◎','⇄','★','☆','✓']), 'decorative glyph leaked into primary HTML UI'
assert "format: 'single'" in app, 'new state must default to singles'
assert 'C.aggregateOwnSelections(state.matches, state.team.format)' in app
assert "C.aggregateOpponentPokemon(state.matches, mode)" in app
assert 'format: environmentFormat' in app
assert html.count('<option value="single">シングル</option><option value="double">ダブル</option>') >= 3, 'singles-first controls missing'
assert '能力ポイント' in app and 'statPointTotal' in app
for text in [html,app,core]:
    assert '努力値' not in text, 'legacy effort-value wording exposed in app'
    assert not re.search(r'(?<!\d)252(?!\d)',text), 'legacy 252 notation exposed in app'
print('STATIC_CHECK PASS',len(ids),'ids',len(refs),'app refs')
