import { POLICY_VERSION } from '../constants';
import type { Consent, ConsentKind, User } from '../types';

// ---------------------------------------------------------------------------
// Quando as políticas mudam, o consentimento antigo não vale para as novas.
//
// Em 26/09/2026 os três documentos públicos foram reescritos: até então
// descreviam um aplicativo de relacionamentos, e o produto virou mercado de
// serviços. Quem tinha aceitado a versão 2026.1 havia concordado com OUTRA
// coisa — inclusive com uma política de privacidade que listava dados que o
// sistema nem coleta mais.
//
// A LGPD trata consentimento como específico e informado (art. 8º, §4º). Mudou
// a finalidade, o consentimento anterior não se estende sozinho à nova.
//
// ESTE ARQUIVO NÃO TEM TELA DE PROPÓSITO. A regra de quem precisa reaceitar é
// o que se quer testar, e testar regra dentro de componente é como ela deixa
// de ser testada.
// ---------------------------------------------------------------------------

/**
 * Os documentos que uma pessoa aceita — e que, mudando, precisam ser aceitos
 * de novo.
 *
 * `maioridade` fica de fora de propósito: é declaração de um FATO ("tenho 18
 * anos ou mais"), não concordância com um texto. O fato não muda porque o
 * documento mudou, e repetir a pergunta a cada versão transformaria uma
 * exigência séria em clique automático.
 */
export const DOCUMENTOS: readonly ConsentKind[] = ['termos', 'privacidade', 'diretrizes'] as const;

/** Rótulo de cada documento, para a tela não ter de repetir esta lista. */
export const NOME_DO_DOCUMENTO: Record<string, string> = {
  termos: 'Termos de Uso',
  privacidade: 'Política de Privacidade',
  diretrizes: 'Diretrizes da Comunidade',
};

/**
 * Quais dos três documentos esta pessoa ainda não aceitou na versão vigente.
 *
 * Devolve lista vazia quando está tudo em dia — e é isso que a tela usa para
 * decidir se aparece.
 */
export function documentosPendentes(
  consents: Consent[] | undefined,
  versaoVigente: string = POLICY_VERSION,
): ConsentKind[] {
  // `undefined` é "não sei", não é "não aceitou". Acontece em um caminho só —
  // um usuário montado sem o embed de `consents` —, e travar a conta de alguém
  // por causa de um dado que não chegou seria o pior resultado possível desta
  // tela. Na dúvida, não bloqueia.
  if (!Array.isArray(consents)) return [];

  return DOCUMENTOS.filter(
    (doc) => !consents.some((c) => c.kind === doc && c.version === versaoVigente),
  );
}

/** Atalho: esta pessoa precisa passar pela tela de reaceite? */
export function precisaReaceitar(me: User | null): boolean {
  if (!me) return false;
  return documentosPendentes(me.consents).length > 0;
}

/**
 * Os registros a gravar quando a pessoa aceita.
 *
 * Grava só o que está pendente. Regravar o que já está na versão vigente
 * mudaria a data de um consentimento que não foi dado agora — e a data é
 * metade do valor do registro.
 */
export function consentimentosAGravar(
  consents: Consent[] | undefined,
  agora: string = new Date().toISOString(),
  versaoVigente: string = POLICY_VERSION,
): Consent[] {
  return documentosPendentes(consents, versaoVigente).map((kind) => ({
    kind, version: versaoVigente, acceptedAt: agora,
  }));
}

/** A versão que a pessoa aceitou por último, para a tela poder dizer. */
export function versaoAceita(consents: Consent[] | undefined): string | undefined {
  if (!Array.isArray(consents) || consents.length === 0) return undefined;
  const dos = consents.filter((c) => (DOCUMENTOS as readonly string[]).includes(c.kind));
  if (dos.length === 0) return undefined;
  return dos.slice().sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt)).at(-1)?.version;
}
