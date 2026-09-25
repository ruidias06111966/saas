import type { User } from '../types';

// ---------------------------------------------------------------------------
// O perfil profissional: o que o torna completo, e quem pode aparecer.
//
// Substitui `services/compatibility.ts`, que pontuava afinidade entre pessoas
// a partir de personalidade, estilo de vida e interesses em comum. Nada disso
// sobrevive ao pivô: num mercado de trabalho ninguém quer o contador mais
// parecido consigo — quer o que sabe fazer, cobra o que cabe e responde.
//
// Por isso aqui não há pontuação de compatibilidade nenhuma. A decisão de com
// quem falar é de quem publica o anúncio, olhando propostas.
// ---------------------------------------------------------------------------

/**
 * Quanto do perfil está preenchido, 0..100.
 *
 * Os pesos não são arbitrários: refletem o que faz alguém ser escolhido num
 * anúncio. Especialidade e resumo pesam mais do que foto, porque quem contrata
 * lê o que a pessoa faz antes de olhar a cara dela — e um perfil sem área de
 * atuação nem aparece na busca por área.
 */
export function profileCompletion(u: User): number {
  const checks: [boolean, number][] = [
    [!!u.name, 6],
    [!!u.profession, 14],
    [u.especialidades.length >= 1, 20],
    [u.especialidades.length >= 3, 6],
    [u.bio.trim().length >= 80, 20],
    [!!u.photo, 10],
    [!!u.city && !!u.state, 6],
    [typeof u.anosExperiencia === 'number', 4],
    [!!u.telefone, 4],
    [u.verified, 10],
  ];
  return Math.round(checks.reduce((s, [ok, w]) => s + (ok ? w : 0), 0));
}

/** O que ainda falta, em português, para a tela cobrar de forma útil. */
export function oQueFalta(u: User): string[] {
  const falta: string[] = [];
  if (!u.profession) falta.push('dizer qual é a sua profissão');
  if (u.especialidades.length === 0) falta.push('escolher em que áreas você atua');
  if (u.bio.trim().length < 80) falta.push('escrever um resumo do que você faz');
  if (!u.photo) falta.push('colocar uma foto');
  if (!u.telefone) falta.push('cadastrar um telefone (ninguém vê até fechar negócio)');
  if (!u.verified) falta.push('verificar a conta');
  return falta;
}

/**
 * Quem pode aparecer para quem.
 *
 * Só barreiras de segurança, e nenhuma de gosto — foi a decisão tomada em
 * 09/2026, quando as preferências deixaram de excluir pessoas da descoberta.
 * A regra de idade saiu junto com a data de nascimento: os Termos continuam
 * exigindo 18 anos, e o registro disso é o consentimento do cadastro.
 */
export function isEligible(me: User, other: User, blockedIds: Set<string>): boolean {
  if (me.id === other.id) return false;
  if (other.status !== 'ativo') return false;
  // No modo online a view nem devolve administração — este teste sobrou para
  // o modo demo, onde `role` existe em todo perfil fictício.
  if (other.role === 'admin') return false;
  if (blockedIds.has(other.id)) return false;
  return true;
}
