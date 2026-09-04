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
 * a vir do próprio app: `BASE_URL` acompanha a base do build — `/saas/` no
 * GitHub Pages, `/` no desenvolvimento e também com domínio próprio. Os três
 * funcionam sem configuração diferente, e mudar de endereço não exige tocar
 * aqui.
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
/**
 * O evento importa, e não só a sessão.
 *
 * Quando alguém abre o link de "esqueci minha senha", o Supabase cria uma
 * sessão de verdade e avisa com `PASSWORD_RECOVERY`. Sem distinguir esse caso,
 * a pessoa cairia direto no app — logada, mas sem ter definido senha nenhuma, e
 * sem entender por quê. O app precisa levá-la à tela de redefinição.
 */
export type EventoDeAuth = 'PASSWORD_RECOVERY' | 'OUTRO';

export function onAuthChange(
  cb: (userId: string | null, evento: EventoDeAuth) => void,
): () => void {
  if (!supabaseEnabled) return () => {};
  const { data } = requireSupabase().auth.onAuthStateChange((evento, session) => {
    cb(
      session?.user?.id ?? null,
      evento === 'PASSWORD_RECOVERY' ? 'PASSWORD_RECOVERY' : 'OUTRO',
    );
  });
  return () => data.subscription.unsubscribe();
}

/**
 * Pede o e-mail de redefinição.
 *
 * NÃO revela se a conta existe. Quem chama deve mostrar a mesma mensagem em
 * qualquer desfecho — uma tela que respondesse "e-mail não encontrado" viraria
 * um oráculo para descobrir quem tem conta num aplicativo de relacionamentos.
 * O próprio Supabase já responde igual nos dois casos; o cuidado aqui é para a
 * interface não desfazer isso.
 */
export async function pedirRedefinicao(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo: enderecoDoApp() },
  );
  // Erros que chegam aqui são de infraestrutura (limite de envio, rede,
  // configuração), nunca "não existe". Esses valem mostrar.
  if (error) throw new Error(traduzErro(error.message));
}

/**
 * Grava a senha nova. Exige uma sessão válida — sem ela o Supabase recusa, que
 * é exatamente o comportamento desejado.
 *
 * Serve aos dois caminhos, e isso não é reaproveitamento preguiçoso: para o
 * Supabase são a mesma operação. Um é a sessão que o link de "esqueci minha
 * senha" acabou de criar; o outro é alguém já dentro do app, em Configurações.
 * O segundo existe porque nem toda entrada passa por senha — quem chega pelo
 * link de confirmação do cadastro está logado sem nunca ter escolhido uma, e
 * sem esta tela ficaria dependendo de um e-mail para definir a primeira.
 */
export async function redefinirSenha(nova: string): Promise<void> {
  const { error } = await requireSupabase().auth.updateUser({ password: nova });
  if (error) throw new Error(traduzErro(error.message));
}

/**
 * Lê no endereço a explicação de um link que não deu certo.
 *
 * O Supabase devolve a pessoa com `#error=...&error_code=otp_expired` quando o
 * link expirou ou já foi usado. Sem ler isso, a tela mostraria um formulário
 * que vai falhar de qualquer jeito, e a pessoa tentaria de novo sem saber que o
 * problema é o link e não a senha.
 */
export function erroDoLink(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const p = new URLSearchParams(hash);
  const codigo = p.get('error_code');
  if (!codigo && !p.get('error')) return null;
  if (codigo === 'otp_expired') {
    return 'Este link expirou. Peça um novo — eles valem por pouco tempo, de propósito.';
  }
  return 'Este link não é mais válido. Pode ter sido usado uma vez ou substituído por outro mais recente.';
}
