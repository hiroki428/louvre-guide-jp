# Louvre Audio Map 共同開発・AI共通ルール（AGENTS.md）

このファイルは、**Louvre Audio Map**（`https://sakai175.github.io/louvre-guide-jp/`）の設計前提・フロアマップ規約・経路探索ルール・UI制約・更新手順をまとめた **唯一の正本（Single Source of Truth）** です。
共同開発に関わるすべてのAIアシスタント（Antigravity / Codex / Claude Code / Cursor / Copilot 等）は、作業前に必ず本書の内容に従ってください。

---

## 1. コミュニケーションと言語

- ユーザー向けの応答、質問文、選択肢、確認メッセージ、アプリ内UI文言は、明示的な指定がない限り **すべて日本語** で記述する。
- 仕様や対応関係（特に階段・エレベーターの接続先など）に推測や曖昧さがある場合は、**勝手に決めず必ずユーザーへ質問して確認する**。

---

## 2. アーキテクチャと編集の正本（重要）

- 依存ライブラリなしの素の ES Modules 静的PWA（Node.js 20+ で動作）。
- **マップ・経路グラフの編集は必ず `scripts/build-floor-maps.mjs` に対して行う。**
  - `src/floor-map-geo.js` と `src/navigation-graph.json` は自動生成物なので、**直接手編集しない**。
  - 変更後は必ず `npm run build:maps` で再生成する。
- 公開版（GitHub Pages）は `main` ブランチへの push をトリガーに GitHub Actions が自動テスト・自動ビルド・デプロイを行う。
- ソース変更時は、PWAキャッシュ更新のため **`public/sw.js` の `SHELL` バージョン（例：`louvre-shell-v45` → `v46`）を必ずインクリメント** する。

### 標準の更新・検証手順
```bash
npm run build:maps   # マップ・経路グラフ再生成（build-floor-maps.mjs を変えた場合）
npm test             # 全7テストスイート実行（必須）
npm run build        # dist/ ビルド確認
```

---

## 3. フロアマップ設計・記号定義（全5階層：2階・1階・0階・−1階・−2階）

### 3-1. 座標系と建築図面
- 全5階層は `viewBox="0 0 960 600"` の統一宮殿フレーム上に精密配置する。
  - `2階・1階・0階`：`1024×429` 建築PPT基準（`S = 912 / 1024, X0 = 24, Y0 = 108`）
  - `−1階・−2階`：`1024×505` 建築PPT基準（同一宮殿外枠へ自動スケーリング）
- 2階にはドゥノン翼の展示室が存在しないため、**2階マップに「ドゥノン翼」ラベルは出さない**。
- 展示室の部屋番号は **全室均一サイズ（`uniformRoomLabels: true`）** で表示し、サイズ混在を避ける。
- 作品ピンは部屋番号と絶対に重ならないよう自動回避配置を維持する（`test/map-contract.mjs` で検証）。
- マップ左上のHUDカード（階表示＋凡例）は宮殿外枠の左上空白内（`x+w <= 202, y+h <= 440`）に収め、宮殿ポリゴンと重ねない。

### 3-2. 施設・エリアの色と記号ルール（PPT元図 ↔ アプリ実装）

| 元図の記号 | 意味 | アプリ内の `type` | 備考 |
|---|---|---|---|
| オレンジ丸 | トイレ | `wc` | 施設フィルタ（WC強調）対応 |
| 紫丸 | エレベーター | `elevator` | 停車階のみ配置 |
| カエル | エスカレーター | `escalator` | リシュリュー中央（−1F〜2F 4階貫通） |
| 緑 `>>>` | 下り階段（下の階へ） | `stairs-down` | 緑バッジ |
| 黄 `>>>` | 上り階段（上の階へ） | `stairs-up` | 青バッジ |
| 黒 `>>>` | **上下階段（上にも下にも進める階段）** | `stairs-both` | 青/緑の2トーンバッジ |
| （特例：1F 535室） | 同階階段（隣室への段差移動のみ） | `stairs` | 1F 535室のみ同階移動用として維持 |
| 赤丸 | 案内所（−2F） | `information` | 赤バッジ `i` |
| `T` | チケット売り場（−2F） | `ticket` | バッジ `T` |
| `S` | ショップ（−2F） | `shop` | バッジ `S` |
| `M` | メトロ（−2F） | `metro` | バッジ `M` |
| `P` | パーキング（−2F） | `parking` | バッジ `P` |
| 黄色エリア（斜線） | **工事中（閉鎖）** | `underConstruction: true` | 1F: 564・558 / 0F: 418・417・415 / −1F: 180・181・179・175・174 |
| 緑エリア（−1F） | ステュディオ（休憩エリア） | `restAreas` | 休憩エリアとして表示 |
| 青エリア（−2F） | 企画展（特別展示） | `exhibitionAreas` | 企画展として表示 |

### 3-3. 工事中エリア・部屋番号の特記事項
- **工事中（閉鎖）エリア内の施設（トイレ・EV・階段等）はすべて非表示にする**（1F 564室トイレ、0F 418/417室EV・階段、−1F 180〜174室WC・EV・階段）。
- 0階の部屋番号：`234` は地図上ラベルを表示しない（作品ピン用アンカーのみ維持）、`306` ではなく **`305`**、`324` ではなく **`327`** を表示する。
- 0階ドゥノン翼西端：`424・422・427` 室＋西端連絡部を含む（`400–427室`）。
- −1階シュリー連絡通路の北側・南側：北が **`131`室**、南が **`130`室**（`130–137室`）。
- 施設アイコン同士は中心間 `>= 13px` を保ち、重なりを防ぐ。

---

## 4. 上下階リンク（`verticalLinks`）と経路探索の厳格ルール

### 4-1. 経路安全性ルール（厳守）
- **行き先・接続先が不明な階段やエレベーターは、マップ上にアイコン表示しても「移動経路グラフ（`navigation-graph.json`）には絶対に組み込まない」。**
  - 例（現在未接続のまま保持）：`−1F 105室西(黄)`、`−1F 132/137境(EV)`、`0F 321–327間(緑・EV)`、`0F 327–328間(緑)`、`0F 337西(EV)`、`−2F ピラミッド直下中央(EV)`。
- **すべての上下階移動エッジは、`floorGeoData.verticalLinks` に登録された確認済みリンクのみを使用する**（`test/navigation.mjs` が自動検証し、未確認エッジが混入するとテストが落ちる）。

### 4-2. エレベーターの停車ルール
- 原則として、エレベーターは **紫ドットがある階すべてに停車** し、**紫ドットがない階には停車しない**（階によって座標が多少ずれていても対応シャフトとして紐づける）。
- 特例として明確に確認済みの限定エレベーター：
  - `ev-denon-center-nw` / `ev-denon-center-ne`（−1F ドゥノン広間北側2基 ↔ 0F 403–406間北側2基）：**0階と−1階のみ移動**。
  - `ev-hall-napoleon-east`（−2F 企画展南西 ↔ −1F 中央東通路）：**−2階と−1階のみ移動**。
- **エレベーター優先モード（`preferElevator: true`）** では、階段（`stairs`）だけでなく **エスカレーター（`escalator`）にも強いペナルティを与え、エレベーター経路を優先する**（`src/navigation.js`）。

### 4-3. 確認済み上下階リンク構成（全38系統）
- **エレベーター（14系統）**
  - 4階貫通（−1F〜2F）：`ev-richelieu-nw`（102↔218↔557↔855）、`ev-richelieu-center`（−1F中央↔0F中央↔500↔800）、`ev-sully-west`（−1F北灰↔300↔601↔902）
  - 3階貫通：`ev-sully-north`（0F〜2F）、`ev-sully-sw`（0F〜2F）、`ev-denon-west`（−1F〜1F）、`ev-denon-center-w`（−1F〜1F）、`ev-denon-center-e`（−1F〜1F）
  - 2階間：`ev-sully-ne`（0F↔1F）、`ev-sully-se`（−1F 134南↔0F 327–328間）、`ev-denon-farwest`（0F↔1F）、`ev-denon-center-nw`（−1F↔0F限定）、`ev-denon-center-ne`（−1F↔0F限定）、`ev-hall-napoleon-east`（−2F↔−1F限定）
- **エスカレーター（1系統）**
  - `escalator-richelieu-center`：**−1F ↔ 0F ↔ 1F ↔ 2F の4階貫通**（リシュリュー中央グレー部）
- **階段（23系統）**
  - 4階貫通（−1F〜2F）：`stairs-sully-west-n`、`stairs-sully-west-s`
  - 3階貫通：`stairs-richelieu-nw`（0F〜2F）、`stairs-richelieu-se`（−1Fステュディオ東↔0F 236右↔1F 531東）、`stairs-sully-n-west`（0F〜2F）、`stairs-sully-n-east`（0F〜2F）、`stairs-sully-se`（0F〜2F）、`stairs-daru`（−1F 170東↔0Fダリュ西・東↔1Fダリュ踊り場）、`stairs-denon-west`（−1F 164西↔0Fドゥノン西↔1Fドゥノン西）
  - 2階間：`stairs-sully-ne`（1F↔2F）、`stairs-sully-ne-lower`（0F北東・316東↔1F北東）、`stairs-denon-farwest`（0F↔1F）、`stairs-richelieu-102-n`（−1F 102北西↔0F 218下北）、`stairs-richelieu-102-s`（−1F 102南西↔0F 218下南）、`stairs-sully-338`（−1F 133南［338記載］↔0F 338室［339側・337側］）、`stairs-denon-403-e`（−1F 160–広間↔0F 403東）、`stairs-denon-406-w`（−1F 広間–170↔0F 406西）、`stairs-denon-402-s`（−1F 169内↔0F 402南）、`stairs-denon-405-n`（−1F 183北↔0F 405北）、`stairs-denon-405-s`（−1F 183南外↔0F 405南）、`stairs-pyramid-n` / `stairs-pyramid-e` / `stairs-pyramid-s`（−2F↔−1F ピラミッド北・東・南）

---

## 5. UI・UXの固定方針（ユーザー合意済み・勝手に戻さないこと）

- アプリ名は **`Louvre Audio Map`**（`src/app-config.js`）。
- 下部4タブ固定（片手操作）：`マップ` / `プラン一覧` / `音声一覧` / `案内・設定`。
- マップタブは **最上部に `map-frame` を配置**し、大きな案内カード（`navigationPanel`）は置かない。
- **入れない機能（ユーザー方針により不採用）**：
  - 自動ズームボタン（`data-focus-destination`）
  - 作品メモ機能（`data-work-note`）
  - 60分コース（90・120・150・180分＋カスタム時間・作品数選択を提供）
  - 地図上の不要なダミー矢印や「概略・検証用」コピー、音声一覧の冗長な導入文
- **必須機能**：
  - スプラッシュ画面のモナ・リザ額縁ポップアップ
  - 最短 vs エレベーター優先トグル（`data-prefer-elevator`）
  - トイレ（`wc`）・カフェ（`cafe`）のピックアップ強調モード
  - Spotify風常駐ミニプレイヤー（前へ・再生/停止・次へ・シークバー・速度調整・閉じる・Media Session API）
  - GPSに頼らない手動現在地修正（部屋番号入力）と音声再生連動の進捗更新
  - 固定コースは階の上下戻り（vertical backtracking）を発生させない

---

## 6. テスト・安全運用

- 変更を加えたら、**コミット前に必ず `npm test`（全7本）と `npm run build` を通す**。
  - `test/map-contract.mjs`：全5階層の形状・部屋番号・施設数・重なり防止・HUD余白・38系統リンク検証
  - `test/navigation.mjs`：経路探索・EV優先・未確認階段/EVの経路混入禁止・縦戻り禁止
  - `test/route-progress.mjs` / `test/location-support.mjs` / `test/my-plan.mjs` / `test/ui-contract.mjs` / `test/catalog.mjs`
- 既存の音声ファイル（`public/audio/`）・作品画像（`public/images/`）・元Excel（`data/`）を無断で削除・上書きしない。
- 新しい仕様変更や例外ルールを決めた場合は、コードと同時に **この `AGENTS.md` も更新してGitHubへ共有する**。
