// =====================================================================
// OmnixOS · Supabase client
// Подгружается в каждую страницу. Создаёт глобальный window.sb (клиент).
// =====================================================================

const SUPABASE_URL = 'https://uuzohiwsdztnavtezgbj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_C4zM2nU67UYOPquv07yaMg_b_c-njJC';

// supabase-js загружается через CDN <script> до этого файла → доступен global supabase
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // важно для OAuth-редиректов и password-reset ссылок
    storageKey: 'omx-auth',
  },
});
