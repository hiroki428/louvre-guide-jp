# Supabase セットアップ手順（無料枠・約5分）

このアプリのログイン・クラウド同期は **Supabase（無料プラン）** に対応しています。
未設定のままでもゲスト利用（端末保存のみ）で全機能が問題なく動作します。

## 1. Supabase プロジェクト作成
1. [Supabase](https://supabase.com/) で無料アカウントを作成し、新しいプロジェクトを作成（Region は `Northeast Asia (Tokyo)` または `West EU (Paris)` 推奨）。

## 2. テーブルと RLS を作成
1. Supabase ダッシュボードの **SQL Editor** を開く。
2. 同フォルダの [`schema.sql`](./schema.sql) の中身を貼り付けて **Run** を実行する。
   - `user_profiles` / `user_plans` / `user_progress` の3テーブルと、自分のデータのみ読み書きできる RLS ポリシーが作成されます。
   - 将来の「同行者とのプラン共有」に使う `share_token` / `is_public` 列もあらかじめ含まれています。

## 3. 認証プロバイダとリダイレクトURLを設定
1. **Authentication > URL Configuration** で以下を設定：
   - **Site URL**: `https://sakai175.github.io/louvre-guide-jp/`
   - **Redirect URLs**:
     - `https://sakai175.github.io/louvre-guide-jp/`
     - `http://127.0.0.1:4173/`（ローカル開発用）
2. **Authentication > Providers**:
   - **Email**（Magic Link / OTP）は初期状態で有効。
   - **Google** ログインを有効にする場合は、Google Cloud Console で OAuth クライアントIDを作成し、Client ID / Secret を登録。

## 4. アプリへ公開キーを設定
1. **Project Settings > API** から **Project URL** と **Publishable / anon public key** をコピー。
2. `src/supabase-config.js` の `SUPABASE_URL` と `SUPABASE_ANON_KEY` に設定する。
   - ⚠️ **`service_role` キーは絶対に書かないこと**（公開してよいのは `anon` / `publishable` キーのみ。RLS により他人のデータにはアクセスできません）。
3. `public/sw.js` の `SHELL` バージョンを 1 つ上げ、`npm test && npm run build` を通してデプロイ。
