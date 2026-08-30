import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Cliente Supabase.
//
// O app tem DOIS modos, e os dois são de primeira classe:
//
//  • Modo demo   — sem variáveis configuradas. Tudo vive no localStorage, com
//                  os 12 perfis fictícios. É o que roda ao clonar o repositório.
//  • Modo online — com VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.
//                  Auth, perfis, conexões e mensagens vêm do Postgres, com RLS.
//
// A chave publicável é pública por natureza: quem protege os dados é o RLS
// (ver docs/SUPABASE.sql). A chave `service_role` NUNCA entra no cliente.
// ---------------------------------------------------------------------------

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseEnabled = Boolean(url && key);

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'conexao.auth',
      },
    })
  : null;

/** Uso interno: só chame onde `supabaseEnabled` já foi verificado. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  return supabase;
}

export const MODE_LABEL = supabaseEnabled ? 'online' : 'demo';
