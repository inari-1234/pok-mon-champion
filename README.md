# Champion Coach v0.6.1

> **Repository edition:** v0.6.1 adds GitHub Actions validation, GitHub Pages deployment, `version.json`, and a cache revision so the repository can be the source of truth. App features are based on v0.6.0.

Pokémon Champions の復帰者・初心者向けに、**好きなポケモン1体から構築を始め、持っていないポケモンを避け、最初に試す育成案まで作る**ローカルWebアプリです。

## 最初の流れ

1. 「構築」で好きなポケモンを1体選ぶ
2. その1体を軸に、残り5体を自分で選ぶか「おまかせで仮組み」
3. 候補を持っていなければ「持っていない」を押す
4. アプリが未所持を除外し、役割の近さ + 今の構築の不足から代替候補を表示
5. 6体を保存
6. 各ポケモンの育成スターターを確認
7. 相手6体を画像一覧から選び、対戦準備へ進む
8. 対戦後は勝敗・選出・事前プランの成否を記録する

## GitHubリポジトリ運用

- `main` = 公開可能な安定版
- `.github/workflows/validate.yml` = 回帰検証
- `.github/workflows/pages.yml` = 検証PASS後にGitHub Pagesへ公開
- `version.json` / `latest.json` = 公開版識別とSHA256確認

Pokémon Champions の能力ポイント表記に合わせ、従来作品の252表記は使いません。育成スターターは1能力0～32、合計66で生成します。

個人データはブラウザの `localStorage` に保存します。環境データや画像の取得に失敗しても、内蔵データと文字表示へフォールバックします。

## 主なファイル

- `index.html` / `styles.css` — UI
- `pokemon-data.js` — ポケモンセレクター
- `competitive-data.js` — Reg M-Cダブルのオフライン予備データ
- `core.js` — 構築・代替・育成・分析ロジック
- `app.js` — UI・保存・環境データ更新
- `manifest.webmanifest` / `sw.js` — PWA
- `tests/` — 自動検証
- `TEST_REPORT.md` — 検証結果

## 注意

「育成スターター」は、最初に対戦へ出すための土台です。すべての相手・構築に対する最適解を保証するものではありません。現行環境についてはゲーム内Roster Infoを最終確認先としてください。
