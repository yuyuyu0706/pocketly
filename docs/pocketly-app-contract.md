# Pocketly App Contract

## 1. Purpose / scope

この文書は、Pocketly の正式アプリとして参加し、または正式アプリを変更するときに守る **current App Contract** の正本である。対象は root `package.json` の明示的な workspace 一覧に登録された `apps/<app-name>/` と、今後そこへ追加するアプリである。

目的は実装方式や UI を揃えることではなく、正式アプリとしての管理境界、宣言、検証入口を揃えることである。browser-only、npm、CDN、vendored asset、自動テストの有無は能力差として認める。本契約は既存 4 アプリの適合判定を行わず、観測された差異を遡及的な欠陥にも変換しない。適合性の判定と証跡は後続 Lv3-C が扱う。

### 適用のタイミング

- **新規アプリ:** 正式 workspace および root Pages 入口へ追加する時点で、本契約の全 Required と、採用能力に対応する Conditionally required を満たす。
- **既存アプリの変更:** 変更対象と影響範囲に関係する requirement を適用する。無関係な過去の差異を同じ PR で一括是正しない。
- **契約自体の変更:** app feature change と区別し、Issue-first で根拠、移行影響、既存アプリへの適用方針を記録する。

## 2. Source of truth and precedence

情報は次の三種類を混同しない。

| 種類 | 意味 | 正本 |
| --- | --- | --- |
| current fact | ある時点で観測した能力・差異 | [`pocketly-app-capability-matrix.md`](pocketly-app-capability-matrix.md) と repository files |
| contract requirement | 正式参加・変更時に守る規則 | 本文書 |
| verification result | requirement を証跡に照らした判定 | Lv3-C 以降の検証記録 |

本契約は app-level の責任を定義する。package metadata、workspace、実行入口の詳細は [`phase-2-package-execution-contract.md`](phase-2-package-execution-contract.md)、CI の詳細は [`phase-3-ci-contract.md`](phase-3-ci-contract.md) を継承する。矛盾時は、対象領域を所有する既存 current contract と repository implementation を優先し、本契約だけで黙示的に上書きしない。変更には各正本を対象とする別の明示的な契約変更が必要である。

Phase 0～3 の completion baseline は当時の完了状態を固定した歴史記録であり、current contract として書き換えない。Phase 3 verification / operations に残る deferred item は本契約の前提条件でも、完了済み事項でもない。

## 3. Requirement levels / terminology

| Level | 意味 |
| --- | --- |
| **Required** | 正式アプリである限り必ず満たす。 |
| **Conditionally required** | 記載された能力・方式を採用、または該当領域を変更するとき必ず満たす。 |
| **Optional** | 能力の採用自体は任意。ただし採用後は対応する条件付き要件に従う。 |
| **Prohibited** | repository contract または検証可能性を壊すため認めない。 |

「test-less」「CDN」「vendored」は level ではなく能力モデルである。Optional capability を持たないことは不適合ではない。例外は要件を消すものではなく、理由と補償検証を追跡可能にする一時的または明示的な判断である。

## 4. App identity / placement

| Level | Requirement |
| --- | --- |
| Required | 正式アプリを `apps/<app-name>/` に置き、`<app-name>` を小文字 kebab-case とする。 |
| Required | app package の `name` を directory 名と一致する repository 内で一意な値とし、`private: true`、用途を示す非空の `description` を宣言する。 |
| Required | app-owned の静的 entry point `index.html` を持つ。 |
| Required | root `package.json` の `workspaces` 明示一覧へ登録し、root Pages 入口からの相対リンクと期待 subpath `/pocketly/apps/<app-name>/` を確認できるようにする。 |
| Prohibited | `apps/*` のような glob だけで正式アプリを暗黙登録する。 |
| Prohibited | directory / package name が一致しない workspace、または root 未登録 workspace を正式アプリとして扱う。 |

新規登録では workspace、root lockfile、root Pages 入口を同じ変更単位で整合させる。既存アプリの feature change では、それらを必要なく変更しない。

## 5. Package metadata / dependency ownership

| Level | Requirement |
| --- | --- |
| Required | Node.js / npm の標準 version と package manager policy は root が所有する。app package に同一の `engines` を形式的に複製しない。 |
| Required | script は実在する能力だけを宣言し、dependency は実際に利用する app の `package.json` が論理的に所有する。 |
| Required | root `package-lock.json` を workspace 全体で唯一の lockfile とする。install と lockfile 更新は repository root で行う。 |
| Conditionally required | npm package を利用する app は適切な `dependencies` / `devDependencies` に直接宣言し、root install と workspace command から解決可能にする。 |
| Optional | 実際の用途がある `license`、`type` 等の metadata は app が宣言できる。build や package publish を行わない静的 app に `main` や `version` は要求しない。 |
| Prohibited | hoist された未宣言 dependency への依存、app-level `package-lock.json`、`npm-shrinkwrap.json`、実体のない script を追加する。 |

root-owned dependency へ移すことは共通化であり、複数 app が利用するだけでは自動的に正当化されない。

## 6. Runtime / asset models

browser-only static files、npm dependency、CDN-loaded runtime、vendored runtime / local-minified library、local image / icon / font / sample / template はすべて **Optional** な方式であり、一律に npm または local asset へ統一しない。

CDN、vendored、local-minified、dynamic-import の第三者資材を採用または更新する場合、次は **Conditionally required** である。app README またはそこから直接参照できる app-owned 文書に記録する。

1. 利用目的と repository 内配置または URL
2. upstream / provenance
3. version、固定方法、または version の確認方法
4. license / attribution
5. repository 内 owner / maintenance boundary
6. update 方法、または未確認である事項
7. runtime network、offline availability、GitHub Pages delivery の前提

local image、icon、font、sample、template を採用する場合は、用途、配置、権利・帰属上の注意、変更時の owner を能力に応じて記録することを **Conditionally required** とする。第三者資材の provenance、version、license、更新履歴を推測で補完することは **Prohibited** である。不明な値は `unconfirmed` として、例外または保守課題に記録する。

## 7. Development contract

| Level | Requirement |
| --- | --- |
| Required | 全正式アプリは、app を実際に起動する `dev` script を持つ。 |
| Required | 標準準備入口を root `npm ci`、標準起動を `npm run dev --workspace=<package-name>`、current endpoint を `http://127.0.0.1:8000/` とする。 |
| Required | current standard は root-owned `scripts/serve-static.mjs` により一度に 1 workspace を HTTP 配信する方式である。契約として保護する外部挙動は workspace validation、app root の配信、host / port、および正常に停止できることである。 |
| Optional | build、watch、hot reload、browser auto-open は必要な app だけが採用できる。採用時は標準 `dev` 入口からの関係を文書化する。 |
| Prohibited | `file://`、Python HTTP server、任意の別 server を Pocketly の正式開発入口として案内する。 |

directory listing、cache header、使用 library といった shared server の内部・付随実装は、継承元 contract が固定しない限り App Contract の普遍要件にはしない。

## 8. Test / quality contract

automated test capability は **Optional** であり、新規・既存を問わず一律 Required にはしない。

| ケース | Contract |
| --- | --- |
| test-owning app | **Conditionally required:** 実体のある `test` と `test:list` を持ち、framework / tests / config / test dependency を app が所有する。browser preparation が必要なら実体のある `test:browser:install` も持つ。root commands から検出・失敗可能にする。 |
| Playwright-owning app | **Conditionally required:** repository browser scope を Chromium とし、app-owned config で `npm run dev`、`http://127.0.0.1:8000/`、`reuseExistingServer: false` を維持する。手動 port 8000 server を事前停止する。 |
| test-less app | 有効な能力ケース。**Required:** test script を捏造せず、README に automated test がないことと再現可能な manual verification を記録する。 |

成功を返すだけの fake passing script、空の test suite を能力保有として宣言すること、test framework の app ownership を理由なく root に移すことは **Prohibited** である。root `npm run test:list` / `npm test` は `--if-present` により script を持つ workspace だけを実行する inherited contract を維持する。

## 9. CI participation contract

- **Required:** 全正式 workspace は root `npm ci` と root orchestration から解決可能である。
- **Conditionally required:** test-owning app は root `npm run test:list` / `npm test` を通じて test の検出と failure が CI へ伝播する。browser preparation が必要なら root preparation から到達可能にする。
- **Required:** test-less app は fake pass なしで `--if-present` により skip される。
- **Required:** repository-owned root commands を別入口で迂回しない。
- **Conditionally required:** root script、port、browser、Playwright config / dependency、lockfile に触れる変更は CI への影響、実行した検証、未実行理由を PR に記録する。
- **Prohibited:** app change の都合だけで workflow / job identity `Pocketly CI` / `Monorepo tests` を変更する。

CI workflow の実装詳細は Phase 3 CI Contract が所有する。required-check 設定等の Phase 3 deferred operations は App Contract 適合の条件にしない。

## 10. GitHub Pages / static delivery

| Level | Requirement |
| --- | --- |
| Required | root Pages `index.html` から正式アプリへ到達でき、`/pocketly/` subpath 配下で entry point と repository 内 asset が解決する。 |
| Required | repository 内 asset 参照は原則 relative path とし、domain root hosting を仮定しない。 |
| Conditionally required | CDN を使う app は external host、runtime network prerequisite、offline limitation を README に記録する。 |
| Conditionally required | 新規アプリ追加または delivery に影響する変更は、Pages subpath での確認結果、または未実行理由を PR に記録する。 |
| Conditionally required | `.nojekyll`、root `index.html`、Pages workflow、app subpath に触れる変更は delivery 影響と分割可否を明示する。 |
| Prohibited | app feature change に Pages 基盤変更を無自覚に混在させる、または既存 4 アプリの root 導線を壊す。 |

## 11. Documentation / maintenance

各正式 app は app-owned README を持ち、以下を **Required** の最低項目として、該当なしの場合も能力状態が分かる形で記録する。

1. purpose / supported use
2. root からの標準起動方法と endpoint
3. runtime / dependency model
4. automated test の有無。ある場合は実行方法、ない場合は manual verification
5. CDN / vendored / local protected asset の有無と詳細への参照
6. license / attribution
7. known constraints / external network prerequisites
8. owner、または app directory を単位とする repository 内 maintenance boundary
9. dependency / protected asset の update 方法、または `unconfirmed` な事項

文書は観測事実、要求、検証結果を区別する。未確認事項を「なし」と書き換えない。既存 README の適合性評価や一括修正は Lv3-C 以降で個別に扱う。

## 12. Change management

新規追加、移行、大きな契約変更は **Required** として Issue-first で扱い、目的、scope、non-scope、想定ファイル、acceptance criteria を確認する。変更を最低でも次へ分類する。

- `app feature change`: 原則 `apps/<app-name>/` 内で完結する。
- `app contract change`: 本文書と必要最小限の案内を扱う。
- `root platform / CI / Pages change`: root、`.github/`、shared script 等の所有 contract に従う。

複数分類を含む場合は影響、必要性、PR 分割可否を明示する。application feature と contract / platform 改修を安易に同一 PR に混在させることは **Prohibited** である。dependency、asset、delivery、test capability の追加・削除は該当する条件付き要件と root command への影響を確認する。

## 13. Exception contract

Required / Conditionally required を直ちに満たせない正当な差異は暗黙運用せず、capability matrix、app README、Issue のいずれか参照可能な場所へ exception record を置く。記録には次をすべて含めることを **Required** とする。

- 対象 requirement
- 理由
- 対象 app / scope
- 影響と risk
- owner / maintenance boundary
- compensating verification
- review trigger または期限
- 解消、継続、Phase 5 候補の判断条件

review trigger 到達時、関連領域の変更時、または前提が失われた時に再評価する。例外を恒久的な無記録免除にすること、未確認情報を推測で閉じることは **Prohibited** である。意図的な能力差が本文の Optional case で表現できる場合、例外は不要である。

## 14. Phase 5 commonization boundary

共通化は **Optional** であり、次をすべて説明できる場合だけ Phase 5 候補とする。

1. 2 つ以上の app に、実際に反復する責務または保守負荷がある。
2. app-local ownership より共通化の保守効果が高い。
3. interface / lifecycle が十分安定している。
4. coupling、release、test、CI、Pages delivery への影響を説明できる。

単一 app の利用、見た目の類似、未確定な将来需要、実装方式の相違だけを理由に `packages/`、`shared/`、`common/` を先行作成することは **Prohibited** である。Playwright config、runtime dependency、UI、application architecture の統一は本契約の目的ではない。

## 15. Lv3-C conformance handoff

Lv3-C は requirement ごとに `compliant`、`non-compliant`、`not applicable`、`exception`、`unconfirmed` を区別し、少なくとも次を repository evidence と root-owned command で判定する。current capability matrix の記述だけを検証結果として転記しない。

| Area | Acceptance rule / evidence |
| --- | --- |
| Identity | directory / package name、kebab-case、`private`、description、`index.html`、root の明示 workspace と Pages link が一致する。 |
| Package / dependency | 利用 npm dependency が app に宣言され、lockfile / shrinkwrap が root の一つだけである。不要な `main` / `version` は判定条件にしない。 |
| Runtime / asset | 採用方式を分類し、第三者資材の目的、provenance、version、license、owner、update、network / delivery 前提が記録または `unconfirmed` / exception として追跡される。 |
| Development | 各 app の `dev` が標準 workspace command から `127.0.0.1:8000` で entry point を配信する。`file://` は標準入口でない。 |
| Test / quality | test-owning app の実体、app ownership、Chromium / HTTP config、root からの検出と failure path を確認する。test-less app は README の status / manual verification と fake pass 不在を確認し、欠陥扱いしない。 |
| CI | 全 workspace が root install で解決し、test-owning app だけが `--if-present` orchestration に参加する。workflow / job identity と deferred item の状態を混同しない。 |
| Pages | root 導線、relative asset、`/pocketly/` subpath、CDN prerequisite、delivery 変更時の確認記録を確認する。 |
| Documentation | section 11 の最低項目を各 README で確認し、不明事項は推測せず記録する。 |
| Change / exception | Issue scope 分類、影響記録、exception の全必須項目と review trigger を確認する。 |
| Commonization | 新規共通境界が section 14 の全条件を満たすか確認する。存在しないこと自体は不適合でない。 |

標準 command の acceptance は root で `npm ci`、`npm run test:list`、`npm test` を実行し、能力保有 app の結果と test-less app の intentional skip を分けて記録する。必要に応じ各 `npm run dev --workspace=<package-name>` と Pages subpath を確認する。実行結果は `passed`、`attempted but blocked`、`failed`、`not run` を厳密に区別する。
