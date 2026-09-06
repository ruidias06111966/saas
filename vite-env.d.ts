/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Sem ela, o registro de erros fica desligado e o app não muda em nada. */
  readonly VITE_SENTRY_DSN?: string;
  /**
   * Chave PÚBLICA do par VAPID. Pública mesmo: vai dentro do JavaScript que
   * qualquer visitante baixa, e é assim que o padrão funciona. A privada
   * mora nos segredos do Supabase e só a Edge Function `notificar` a vê.
   * Sem esta variável o app não oferece aviso no celular. Ver docs/PUSH.md.
   */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
