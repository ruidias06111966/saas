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

/**
 * Para onde o link do e-mail deve trazer a pessoa de volta.
 *
 * Sem isto o destino sai inteiro do "Site URL" do painel do Supabase, cujo
 * padrão é `localhost:3000` — e o link levaria toda pessoa real a uma página
 * que não existe, sem erro nenhum do nosso lado. Dizendo aqui, o endereço passa
 * a vir do próprio app: `BASE_URL` é `/saas/` na publicação e `/` no
 * desenvolvimento, então os dois funcionam sem configuração diferente.
 *
 * O Supabase só aceita destinos da lista de Redirect URLs do projeto (o Site
 * URL entra nela automaticamente). Se este endereço não estiver lá, o link cai
 * no Site URL em vez de falhar — o que degrada, mas não quebra.
 */
function enderecoDoApp(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await requireSupabase().auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo: enderecoDoApp() },
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

/**
 * Reenvia o e-mail de confirmação. Existe porque o primeiro se perde: cai no
 * spam, a pessoa fecha a aba, o endereço tinha um erro de digitação.
 */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.resend({
    type: 'signup', email: email.trim().toLowerCase(),
    options: { emailRedirectTo: enderecoDoApp() },
  });
  if (error) throw new Error(traduzErro(error.message));
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
