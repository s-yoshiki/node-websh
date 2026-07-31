# node-websh

[![CI](https://github.com/s-yoshiki/node-websh/actions/workflows/ci.yml/badge.svg)](https://github.com/s-yoshiki/node-websh/actions/workflows/ci.yml)
[![Documentation](https://img.shields.io/badge/docs-GitHub%20Pages-0969da)](https://s-yoshiki.github.io/node-websh/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) | 日本語

[xterm.js](https://xtermjs.org/) を使い、実際の疑似端末上で動く対話型シェルを
ブラウザに表示します。サーバーは [Hono](https://hono.dev/) と
[node-pty](https://github.com/microsoft/node-pty)、フロントエンドは React で構築され、
すべて TypeScript で実装されています。

node-websh は、自分が管理するマシンのシェルへ一時的にブラウザからアクセスしたい
場合に便利です。開発マシン、ホームサーバー、コンテナ、プライベートネットワーク内の
リモートホストなどでの利用を想定した、小規模なシングルユーザー向けツールです。

**[ドキュメント](https://s-yoshiki.github.io/node-websh/)** ·
[設定](https://s-yoshiki.github.io/node-websh/configuration.html) ·
[デプロイ](https://s-yoshiki.github.io/node-websh/deployment.html) ·
[セキュリティ](https://s-yoshiki.github.io/node-websh/security.html)

> [!WARNING]
> node-websh は、認証されたすべてのクライアントに、サーバーを実行している
> ユーザー権限の対話型シェルを提供します。デフォルトでは `127.0.0.1` のみに
> バインドします。他のマシンから到達可能にする前に、HTTPS の背後に配置し、
> 非特権ユーザーで実行したうえで
> [セキュリティガイド](https://s-yoshiki.github.io/node-websh/security.html)を
> 確認してください。

## 主な機能

- 実際の PTY を使用。対話型プログラム、ジョブ制御、カラー表示、カーソル移動、
  ターミナルのリサイズがローカル端末と同様に動作します。
- Unicode 11 の文字幅処理、10,000 行のスクロールバック、リンクのクリック、
  クリップボード連携に対応したレスポンシブな xterm.js フロントエンド。
  WebGL を利用できない環境では Canvas にフォールバックします。
- ブラウザとサーバーが共有する、実行時検証付きの単一ワイヤープロトコル。
- トークンによるサインインと `HttpOnly; SameSite=Strict` セッション Cookie。
- Origin チェック、定数時間でのトークン比較、サインインのレート制限、
  厳格な Content-Security-Policy、ループバック限定のデフォルトバインド。
- 一時的なネットワーク切断に対する WebSocket の自動再接続。
- バンドル済みサーバーファイル、ビルド済みフロントエンド、唯一の実行時依存である
  `node-pty` をまとめた、自己完結型の本番用ディレクトリ。

## 動作要件

| 要件 | バージョン・補足 |
| --- | --- |
| Node.js | 20 以上 |
| pnpm | 11 以上 |
| ブラウザ | WebSocket に対応した現行ブラウザ |
| ネイティブビルドツール | 通常は不要です。`node-pty` は一般的な環境向けのビルド済みバイナリを提供しています。ローカルでコンパイルする場合は Python と C++ ツールチェーンが必要です。 |

CI では Node.js 22 と Ubuntu を使用し、lint、型チェック、ユニットテスト、
ビルド、E2E テストを実行しています。

## クイックスタート

```bash
git clone https://github.com/s-yoshiki/node-websh.git
cd node-websh
pnpm install
pnpm dev
```

<http://localhost:5173> を開きます。開発モードでは次の 2 つが起動します。

- `127.0.0.1:8999` の Hono／WebSocket サーバー
- `127.0.0.1:5173` の Vite フロントエンド。API と WebSocket のリクエストを
  サーバーへプロキシします。

起動時に、サーバーはランダムなアクセストークンとアクセス用 URL を表示します。

```text
node-websh 0.2.0 — terminal over the web

Open:  http://127.0.0.1:8999/#token=...
Token: ...
```

開発モードでは、表示されたトークンを <http://localhost:5173> のログインフォームへ
貼り付けてください。表示される `:8999` のリンクは、サーバー自身が
フロントエンドも配信する本番ビルド向けです。

ローカル開発用トークンを固定する場合：

```bash
WEBSH_TOKEN=local-development-token pnpm dev
```

## 本番ビルド

```bash
pnpm build
pnpm start
```

サーバーが表示する URL（通常は <http://127.0.0.1:8999>）を開きます。
`#token=...` フラグメントはブラウザによって読み取られ、セッション Cookie と交換後、
アドレスバーから直ちに削除されます。URL フラグメントは HTTP リクエストでは
送信されないため、クエリ文字列のようにサーバーやプロキシのログへ記録されません。

`pnpm build` は、次のデプロイ可能なディレクトリを生成します。

```text
apps/server/dist/
├── main.js
├── main.js.map
├── package.json
└── public/
```

互換性のある別のホストで実行する場合：

```bash
scp -r apps/server/dist user@example.com:/opt/node-websh
ssh user@example.com
cd /opt/node-websh
npm install --omit=dev
WEBSH_TOKEN="replace-with-a-long-random-token" npm start
```

インストールされる `node-pty` バイナリは、実行先ホストの OS と CPU
アーキテクチャに合っている必要があります。上記のように実行先で
`npm install --omit=dev` を実行することで、適切なネイティブパッケージが
選択されます。

### 単一実行ファイル

実験的な Node.js
[Single Executable Application](https://nodejs.org/api/single-executable-applications.html)
ビルドを使うと、サーバー、フロントエンド、Node.js ランタイム、
プラットフォーム固有の `node-pty` ファイルを 1 つの実行ファイルにまとめられます。

```bash
pnpm build:sea
./apps/server/dist/node-websh
```

Windows では `apps/server/dist/node-websh.exe` が生成されます。実行ファイルは、
ビルドに使用した Node.js バイナリの OS と CPU アーキテクチャ専用です。
実行先ホストに Node.js をインストールする必要はありません。

SEA の生成には、公式 Node.js 22.20 以上が必要です。Node.js 25.5 以上では
組み込みの `--build-sea` を使用し、それ以前の対応バージョンでは自動的に
`postject` を使用します。Homebrew の Node は共有 `libnode` を使うため
SEA が無効化されています。[nodejs.org](https://nodejs.org/en/download)、
バージョンマネージャー、または他の公式配布の Node.js バイナリを指定してください。

```bash
NODE_SEA_EXECUTABLE=/path/to/official/node pnpm build:sea
```

`node-pty` には、OS が実行ファイル内から直接ロードできないネイティブコードが
含まれています。そのため SEA は起動時に、埋め込まれたフロントエンドと
ネイティブランタイムファイルを専用の一時ディレクトリへ展開し、正常終了時に
削除します。

生成された実行ファイルは、次のコマンドで検証できます。

```bash
pnpm test:e2e:sea
```

## 設定

すべてのサーバーオプションは、コマンドラインフラグと `WEBSH_*` 環境変数の
両方で指定できます。優先順位は、コマンドラインフラグ、環境変数、
デフォルト値の順です。

| フラグ | 環境変数 | デフォルト | 用途 |
| --- | --- | --- | --- |
| `--host <address>` | `WEBSH_HOST` | `127.0.0.1` | バインドするアドレス。リバースプロキシを使う場合はループバックのままにしてください。 |
| `-p, --port <number>` | `WEBSH_PORT` | `8999` | HTTP／WebSocket ポート。 |
| `--token <token>` | `WEBSH_TOKEN` | 自動生成 | アクセストークン。常時運用する場合は明示的に設定してください。 |
| `--shell <path>` | `WEBSH_SHELL` | `$SHELL` | 新しいターミナルで実行するシェル。 |
| `--cwd <path>` | `WEBSH_CWD` | ホームディレクトリ | 新しいターミナルの初期作業ディレクトリ。 |
| `--session-ttl-minutes <n>` | `WEBSH_SESSION_TTL_MINUTES` | `720` | セッションの有効期間（分）。 |
| `--max-sessions <n>` | `WEBSH_MAX_SESSIONS` | `8` | 同時に利用できるターミナルの最大数。 |
| `--allowed-origin <origin>` | `WEBSH_ALLOWED_ORIGINS` | なし | API と WebSocket の利用を追加で許可するブラウザ Origin。フラグは繰り返し指定でき、環境変数はカンマ区切りで指定できます。 |
| `--secure-cookie` | `WEBSH_SECURE_COOKIE=1` | オフ | セッション Cookie に `Secure` 属性を強制します。HTTPS は `X-Forwarded-Proto` からも自動検出します。 |
| `--insecure-no-auth` | `WEBSH_INSECURE_NO_AUTH=1` | オフ | 組み込み認証を無効化します。下記の警告を確認してください。 |
| `--static-dir <path>` | `WEBSH_STATIC_DIR` | 自動検出 | ビルド済みフロントエンドを格納したディレクトリ。 |

ビルド後、同じ一覧をターミナルで確認できます。

```bash
node apps/server/dist/main.js --help
```

よく使う設定例：

```bash
# zsh を使用し、各ターミナルをプロジェクトディレクトリで開始する
pnpm start --shell /bin/zsh --cwd /srv/project

# ランダムに生成した固定トークンを使用する
WEBSH_TOKEN="$(openssl rand -hex 24)" pnpm start

# 有効期間の短いターミナルを 1 つだけ許可する
pnpm start --max-sessions 1 --session-ttl-minutes 60
```

> [!CAUTION]
> `--insecure-no-auth` を使うと、ポートへ到達できるすべてのユーザーが
> サインインなしでシェルを利用できます。信頼できる上流システムで認証と
> ネットワークアクセス制御を行っている場合に限って使用してください。

詳細とその他の例は
[設定リファレンス](https://s-yoshiki.github.io/node-websh/configuration.html)を
参照してください。

## 安全なデプロイ

ローカル以外からアクセスできるようにする場合：

1. node-websh 専用の非特権 OS ユーザーで実行します。
2. `WEBSH_HOST=127.0.0.1` のままにし、手前にリバースプロキシを配置します。
3. プロキシで TLS を終端し、WebSocket Upgrade を転送します。
4. 元の `Host` ヘッダーを維持し、`X-Forwarded-Proto: https` を転送します。
5. サービスログに表示される自動生成トークンではなく、十分に長いランダムな
   `WEBSH_TOKEN` を設定します。
6. ファイアウォール、VPN、プライベートネットワークなどで到達範囲を制限します。

Caddy の設定は次の内容だけで動作します。

```caddyfile
websh.example.com {
    reverse_proxy 127.0.0.1:8999
}
```

nginx、Docker、systemd、プロキシのタイムアウト、詳しいチェックリストについては
[デプロイガイド](https://s-yoshiki.github.io/node-websh/deployment.html)を
参照してください。

## セキュリティモデル

アクセストークンは `POST /api/auth/session` に一度だけ送信されます。
サインインに成功すると、不透明なセッション ID がメモリ上に作成され、
`HttpOnly; SameSite=Strict` Cookie として返されます。サーバーを再起動すると
すべてのセッションが無効になり、すべての子シェルも終了します。

サーバーは、次の対策も提供します。

- トークンダイジェストの定数時間比較
- クライアントアドレスごとに 1 分間で 10 回までのサインイン失敗制限
- WebSocket Upgrade と状態を変更する API リクエストに対する明示的な
  `Origin` 検証
- 厳格な Content-Security-Policy を含むセキュリティレスポンスヘッダー
- 同時ターミナルセッション数の上限設定

node-websh は意図的に次の機能を提供していません。

- TLS 終端
- 複数ユーザー、アカウント、ユーザーごとの権限
- シェルのサンドボックス化や権限分離
- ターミナルの入力・出力の記録や監査ログ

シェルは、サーバープロセスの権限と環境変数の大部分を引き継ぎます。
node-websh のデプロイは SSH アクセスと同等の注意を払って扱ってください。
ネットワークへ公開する前に、必ず
[セキュリティガイド](https://s-yoshiki.github.io/node-websh/security.html)を
確認してください。

脆弱性を報告する場合は、公開 Issue ではなく
[GitHub の非公開セキュリティアドバイザリ](https://github.com/s-yoshiki/node-websh/security/advisories/new)を
利用してください。

## アーキテクチャ

```text
ブラウザ
  React アプリ
    └── TerminalView (xterm.js)
          └── TerminalTransport
                └── WebSocket
                      └── Hono サーバー
                            └── node-pty
                                  └── 対話型シェル
```

```text
apps/
├── server/       Hono + node-pty + WebSocket。ビルド済みフロントエンドも配信
└── web/          React アプリケーション
packages/
├── protocol/     ワイヤープロトコル、実行時ガード、トランスポートインターフェース
└── terminal-ui/  再利用可能な xterm.js React コンポーネント
configs/
├── tsconfig/     共通 TypeScript 設定
└── biome/        共通 Biome 設定
docs/             GitHub Pages で公開する静的ドキュメントサイト
```

`TerminalView` は `TerminalTransport` インターフェースのみに依存しており、
フレームが WebSocket と他のトランスポートのどちらを通るかを意識しません。
プロトコルは `packages/protocol` で一度だけ定義し、ブラウザとサーバーの
両方からインポートすることで、メッセージ形式と検証を同期させています。

メッセージ形式、クローズコード、HTTP エンドポイントについては
[ワイヤープロトコルリファレンス](https://s-yoshiki.github.io/node-websh/protocol.html)、
より詳しい構成については
[Architecture](https://s-yoshiki.github.io/node-websh/architecture.html)を
参照してください。

## 開発

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | サーバーを `:8999`、Vite を `:5173` で起動します。 |
| `pnpm build` | フロントエンドをビルドし、サーバーとまとめてバンドルします。 |
| `pnpm build:sea` | プラットフォーム固有の単一実行ファイルを生成します。 |
| `pnpm start` | ビルド済みサーバーを起動します。 |
| `pnpm lint` | Biome でワークスペースを検査します。 |
| `pnpm lint:fix` | Biome の安全な修正を適用します。 |
| `pnpm format` | Biome でワークスペースをフォーマットします。 |
| `pnpm typecheck` | 各パッケージで `tsc --noEmit` を実行します。 |
| `pnpm test` | 実際の PTY を使うテストを含むユニットテストを実行します。 |
| `pnpm test:e2e` | 本番ビルドに対して、認証、Cookie、Origin、WebSocket、UTF-8、リサイズ、実際のシェルをテストします。 |
| `pnpm test:e2e:sea` | SEA 実行ファイルに対して同じ E2E テストを実行します。 |
| `pnpm clean` | 生成されたビルド出力を削除します。 |

変更を提出する前に、次のチェックを実行してください。

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

E2E テストは `apps/server/dist/` を使用するため、`pnpm build` の後に
実行してください。詳しくは
[開発ガイド](https://s-yoshiki.github.io/node-websh/development.html)を
参照してください。

## トラブルシューティング

| 症状 | 考えられる原因・対処 |
| --- | --- |
| ログインには成功するが、状態が「Reconnecting…」のままになる | リバースプロキシが WebSocket Upgrade を転送していないか、アイドルタイムアウトが短すぎます。 |
| すぐにログイン画面へ戻される | プロキシが `Host` ヘッダーを書き換えている、リクエストの Origin が許可されていない、または HTTP 接続で `Secure` Cookie が設定されています。 |
| すべてのターミナルで `posix_spawnp failed` が発生する | node-pty の `spawn-helper` から実行ビットが失われています。`scripts/postinstall.mjs` を実行する `pnpm install` を再実行してください。 |
| ページは表示されるがターミナルが現れない | `pnpm build` でフロントエンドをビルドするか、`index.html` を含むディレクトリを `WEBSH_STATIC_DIR` に指定してください。 |
| シェルが意図しないディレクトリで起動する | `WEBSH_CWD` または `--cwd` を設定してください。 |
| 他のターミナルが開いていると接続を拒否される | `WEBSH_MAX_SESSIONS` を増やすか、既存のターミナルを閉じてください。 |
| 開発用 UI からバックエンドへ接続できない | ポート `5173` と `8999` が空いているか確認してください。バックエンドがデフォルト以外のアドレスの場合は、`WEBSH_BACKEND` を Hono サーバーへ向けてください。 |

## ドキュメント

| ページ | 内容 |
| --- | --- |
| [概要](https://s-yoshiki.github.io/node-websh/) | プロジェクト概要と初回起動 |
| [開発](https://s-yoshiki.github.io/node-websh/development.html) | モノレポのセットアップと開発手順 |
| [デプロイ](https://s-yoshiki.github.io/node-websh/deployment.html) | ビルド出力、systemd、リバースプロキシ、Docker |
| [アーキテクチャ](https://s-yoshiki.github.io/node-websh/architecture.html) | コンポーネントとデータフロー |
| [ワイヤープロトコル](https://s-yoshiki.github.io/node-websh/protocol.html) | フレーム、クローズコード、HTTP エンドポイント |
| [セキュリティ](https://s-yoshiki.github.io/node-websh/security.html) | 認証モデル、ハードニング、制限事項 |
| [設定](https://s-yoshiki.github.io/node-websh/configuration.html) | フラグ、環境変数、デフォルト値、設定例 |

## 関連プロジェクト

[majin](https://github.com/s-yoshiki/majin) は同じアイデアを Rust コア、
自己完結型バイナリ、Tauri デスクトップアプリケーションで実現する
関連プロジェクトです。

## 使用技術

[xterm.js](https://github.com/xtermjs/xterm.js) ·
[Hono](https://hono.dev/) ·
[node-pty](https://github.com/microsoft/node-pty) ·
[React](https://react.dev/) ·
[Vite](https://vite.dev/) ·
[Turborepo](https://turborepo.com/) ·
[Biome](https://biomejs.dev/)

## ライセンス

[MIT](LICENSE)
