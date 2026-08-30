import type { Session } from '@supabase/supabase-js';
import { requireSupabase, supabaseEnabled } from './supabaseClient';

// ---------------------------------------------------------------------------
// Autenticação.
//
// Em modo online usa o Supabase Auth: senha com hash bcrypt no servidor, JWT
// de curta duração e refresh automático. Em modo demo, o app continua com a
// comparação local de SHA-256 dos perfis fictícios — que serve para navegar a
// demonstração e nada além disso.
// ---------------------------------------------------------------------------

export interface AuthResult {
  userId: string | null;
  /** true quando a conta foi criada mas o e-mail ainda precisa ser confirmado. */
  needsEmailConfirmation: boolean;
}

function traduzErro(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Já existe uma conta com este e-mail.';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
  }
  if (m.includes('password should be at least')) return 'A senha precisa de pelo menos 6 caracteres.';
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  }
  return mensagem;
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await requireSupabase().auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(traduzErro(error.message));
  return {
    userId: data.user?.id ?? null,
    // Sem sessão logo após o cadastro = confirmação de e-mail está ligada.
    needsEmailConfirmation: !data.session,
  };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await requireSupabase().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(traduzErro(error.message));
  return { userId: data.user?.id ?? null, needsEmailConfirmation: false };
}

export async function signOut(): Promise<void> {
  if (!supabaseEnabled) return;
  await requireSupabase().auth.signOut();
}

export async function currentSession(): Promise<Session | null> {
  if (!supabaseEnabled) return null;
  const { data } = await requireSupabase().auth.getSession();
  return data.session;
}

/** Avisa quando a sessão muda (login, logout, refresh, expiração). */
export function onAuthChange(cb: (userId: string | null) => void): () => void {
  if (!supabaseEnabled) return () => {};
  const { data } = requireSupabase().auth.onAuthStateChange((_event, session) => {
    cb(session?.user?.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}
