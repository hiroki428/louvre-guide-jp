// Supabase 接続設定（静的PWA公開用：URL と Publishable / Anon Key のみ記載。service_role key は絶対に置かないこと）
// Supabase プロジェクト作成後に下の2つを設定すると、案内・設定タブからログイン＆クラウド同期が有効になります。
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

export function isSupabaseConfigured(config = {url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY}) {
  return Boolean(config?.url && config?.anonKey && /^https?:\/\//.test(config.url));
}
