チャットアプリ（リアルタイム + 認証付き）

1. 🔍 概要

このアプリは、フルスタック構成（Next.js + Go + PostgreSQL）で構築した認証付きチャットツールです。ユーザー登録〜ログイン認証、リアルタイムチャット、未読管理、メッセージ撤回など、実務レベルの複合機能を一貫して自力で設計・実装しました。

2. 🛠 技術スタック

フロントエンド：Next.js（TypeScript）/ HTML / CSS / React

バックエンド：Go

通信方式：REST API + WebSocket

認証方式：JWT + HttpOnly Cookie / Authorization Header

データベース：PostgreSQL

その他：Git / GitHub / Docker 

3. 🎯 目的と背景

フルスタック構成の理解を深めるため、認証から非同期チャットまで自力で構築

REST API 設計と SQL / DB モデル設計の実践力を強化

状態管理と WebSocket を通じて、非同期処理やリアルタイムUI設計の力を伸ばす

4. 💡 主な機能一覧

🔐 基本機能

サインアップ / ログイン / ログアウト（JWT）

1対1チャット（ユーザー同士の専用ルーム生成）

メッセージ送受信（非同期 + REST + WebSocket）

🚀 応用機能

グループチャット作成 / 参加 / 退出

添付ファイルアップロード（画像）

メッセージの削除（非表示）/ 撤回（物理削除）

既読 / 未読状態のリアルタイム同期

スタンプ / 絵文字挿入、リアクション

@メンション通知（DB + WebSocketで非既読通知）

ルーム別 + 全体ブロードキャストの WebSocket

5. 🧱 システム構成（アーキテクチャ）

flowchart LR
    UI[Next.js Frontend] <--> API[Go]
    API <--> DB[(PostgreSQL)]
    UI <--> WS[WebSocket Channel]

6. 🖥️ 実装した画面

サインアップ / ログインページ

チャットリストページ（グループ + 1対1）

チャット画面（メッセージ、リアクション、既読UI）

入力フォーム（スタンプ、メンション、添付対応）

通知バッジ / メンション一覧画面

7. 🌐 GitHub / デプロイ

GitHub: https://github.com/llllliiiin/chat_app

8. 📈 苦労した点・工夫した点

JWTとセッションの切替え：Cookie/ヘッダーの両対応、安全性の考慮

WebSocket管理：room別/全体ブロードキャストを分離設計、sync.Mutex で排他制御

未読数更新：入室時・新着時での unread_map の正確な同期ロジック

DB設計の工夫：message_reads, mentions, message_hidden の機能分離で柔軟に

エラー設計：ステータスコード / エラー文を統一

9. 🛠 今後の改善・展望

CI/CD（GitHub Actions + Cloud Run 自動デプロイ）導入

Google / LINE OAuth によるログイン導入

スマホ対応（レスポンシブ + ネイティブ風UI）

通知設定 / ミュート / ピン留め / スレッド返信

管理者向けルーム管理画面の追加

10. 🎓 成長と振り返り

このプロジェクトを通して、「ゼロから構築できる自信」と「本番構成を意識した設計力」を身につけました。

JWT, REST API, DB正規化、非同期通信、WebSocket、状態管理といった開発現場で必要な要素を自走して実装。

特に WebSocket やDB設計は試行錯誤が多く、「実務的な困難をどう乗り越えるか」を体験できました。

UI/UX・セキュリティ・スケーラビリティへの意識が芽生え、次のステップへの課題も明確にできました。

