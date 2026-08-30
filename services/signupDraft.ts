// ---------------------------------------------------------------------------
// Rascunho do cadastro, guardado entre "criar a conta" e "confirmar o e-mail".
//
// POR QUE ISTO PRECISA EXISTIR
// Com a confirmação de e-mail ligada, `signUp()` cria a conta mas NÃO devolve
// sessão. E sem sessão nada pode ser gravado: a política de `public.users` é
// `id = auth.uid()` e a do Storage exige que a pasta seja a de auth.uid().
// Antes disto, o cadastro terminava com uma conta de autenticação sem perfil
// nenhum — a pessoa confirmava o e-mail, entrava, e o aplicativo não tinha o
// que carregar.
//
// Então o perfil inteiro espera aqui, no aparelho de quem se cadastrou, e é
// gravado na primeira entrada — quando finalmente existe sessão.
//
// Fica no localStorage e é apagado assim que o perfil sobe. Se a pessoa
// confirmar o e-mail em outro aparelho, o rascunho não está lá: o aplicativo
// pede os dados de novo, com a sessão já valendo. Perde-se digitação, nunca a
// conta.
// ---------------------------------------------------------------------------

const CHAVE = 'conexao.cadastro.rascunho';

export interface SignupDraft {
  /** id da conta no Supabase Auth, devolvido por signUp(). */
  userId: string;
  email: string;
  /** O perfil serializado, incluindo a foto como dataURL. */
  perfil: string;
  criadoEm: string;
}

export function saveDraft(userId: string, email: string, perfil: unknown): void {
  try {
    const d: SignupDraft = {
      userId, email, perfil: JSON.stringify(perfil), criadoEm: new Date().toISOString(),
    };
    localStorage.setItem(CHAVE, JSON.stringify(d));
  } catch (err) {
    // Cota estourada costuma ser a foto. O cadastro continua; a pessoa
    // completa o perfil na primeira entrada.
    console.warn('[cadastro] não foi possível guardar o rascunho', err);
  }
}

export function loadDraft(userId: string): unknown | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const d = JSON.parse(bruto) as SignupDraft;
    // Só serve para a conta que o criou. Um rascunho alheio no mesmo navegador
    // viraria perfil trocado.
    if (d.userId !== userId) return null;
    // Rascunho velho é lixo: a pessoa desistiu ou terminou em outro aparelho.
    if (Date.now() - Date.parse(d.criadoEm) > 7 * 86400_000) { clearDraft(); return null; }
    return JSON.parse(d.perfil);
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try { localStorage.removeItem(CHAVE); } catch { /* ignorado */ }
}

/** Existe rascunho aguardando confirmação? Usado só para o texto da tela. */
export function draftEmail(): string | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as SignupDraft).email : null;
  } catch {
    return null;
  }
}
