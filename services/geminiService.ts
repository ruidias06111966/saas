import type { ConversationHealth, Message, ModerationResult, User } from '../types';
import { LADDER, OPENERS, PROFILE_PROMPT_MAP } from '../data/prompts';
import { INTEREST_MAP } from '../data/interests';
import { computeCompatibility, profileCompletion, sharedInterestIds } from './compatibility';
import { supabase, supabaseEnabled } from './supabaseClient';
import { firstName, seededRandom, shuffle } from './utils';

// ---------------------------------------------------------------------------
// Copiloto de Conversa — lado do cliente.
//
// A chave do Gemini NÃO existe aqui. Toda geração passa pela Edge Function
// `copiloto` (supabase/functions/copiloto), que exige JWT e é dona dos prompts.
// O cliente manda apenas dados de perfil já públicos e escolhe uma ação de uma
// lista fechada.
//
// REGRAS DO PRODUTO, não negociáveis:
//  1. A IA NUNCA envia mensagem sozinha. Ela sugere; a pessoa edita e envia.
//  2. A IA NUNCA se passa pelo usuário nem inventa fatos sobre ele.
//  3. Sem backend, tudo continua funcionando: cada função tem um fallback
//     determinístico local, alimentado por um banco curado de perguntas.
//  4. Nenhum dado sensível (e-mail, senha, coordenada) entra no payload.
// ---------------------------------------------------------------------------

type Acao =
  | 'aberturas' | 'proxima_pergunta' | 'explicar' | 'melhorar_perfil'
  | 'afinidades' | 'termometro' | 'moderar' | 'despedida';

interface Payload {
  eu?: string; outra?: string; conversa?: string; resumo?: string;
  perfil?: string; texto?: string; nome?: string;
  nivel?: number; completude?: number;
}

/** O Copiloto só gera quando há backend; sem ele, opera em modo local. */
export const aiEnabled = supabaseEnabled;

async function invocar<T>(acao: Acao, payload: Payload, fallback: T): Promise<T> {
  if (!supabase) return fallback;
  try {
    const { data, error } = await supabase.functions.invoke('copiloto', {
      body: { acao, payload },
    });
    if (error) throw error;
    // A função devolve { fallback: true } quando não há chave configurada.
    if (!data || data.fallback || !data.dados) return fallback;
    return data.dados as T;
  } catch (err) {
    console.warn('[Copiloto] Falha na Edge Function; usando o fallback local.', err);
    return fallback;
  }
}

/** Retrato mínimo e seguro de um perfil. Só o que já é público no app. */
function profileDigest(u: User, label: string): string {
  const answers = u.answers
    .filter((a) => a.answer.trim())
    .slice(0, 4)
    .map((a) => `  - "${PROFILE_PROMPT_MAP[a.promptId]?.label ?? a.promptId}" → ${a.answer}`)
    .join('\n');
  return [
    `${label}: ${firstName(u.name)}, ${u.age} anos, ${u.city}.`,
    `Profissão: ${u.profession || 'não informada'}.`,
    `Objetivo: ${u.goal}.`,
    `Bio: ${u.bio || '—'}`,
    `Interesses: ${u.interests.map((i) => INTEREST_MAP[i]?.label ?? i).join(', ') || '—'}`,
    answers ? `Respostas do perfil:\n${answers}` : '',
  ].filter(Boolean).join('\n');
}

const primeiro = (r: { items?: string[] }, padrao: string) => r.items?.[0] ?? padrao;

// --------------------------- 1. Aberturas -----------------------------------

function localOpeners(me: User, other: User): string[] {
  const shared = sharedInterestIds(me, other);
  const rnd = seededRandom(`${me.id}:${other.id}:opener`);
  const answered = other.answers.filter((a) => a.answer.trim());
  return shuffle(OPENERS, rnd).map((tpl) =>
    tpl
      .replace('{interesse}', INTEREST_MAP[shared[0]]?.label.toLowerCase() ?? 'algumas coisas')
      .replace('{prompt}', PROFILE_PROMPT_MAP[answered[0]?.promptId]?.label ?? 'seu perfil')
      .replace('{cidade}', other.city)
      .replace('{palpite}', INTEREST_MAP[other.interests[0]]?.label.toLowerCase() ?? 'pessoa de rotina'),
  ).slice(0, 3);
}

export async function suggestOpeners(me: User, other: User): Promise<string[]> {
  const fallback = localOpeners(me, other);
  const r = await invocar<{ items: string[] }>('aberturas', {
    eu: profileDigest(me, 'PESSOA A'),
    outra: profileDigest(other, 'PESSOA B'),
  }, { items: fallback });
  return r.items?.length ? r.items.slice(0, 3) : fallback;
}

// --------------------------- 2. Próxima pergunta ----------------------------

function localNextQuestion(level: 1 | 2 | 3 | 4, seed: string): string {
  const pool = LADDER.filter((q) => q.level === level);
  return shuffle(pool, seededRandom(seed))[0]?.text ?? 'O que fez o seu dia melhor hoje?';
}

export async function suggestNextQuestion(
  me: User, other: User, messages: Message[], level: 1 | 2 | 3 | 4,
): Promise<string> {
  const fallback = localNextQuestion(level, `${me.id}:${other.id}:${messages.length}`);
  const conversa = messages.filter((m) => m.kind !== 'sistema').slice(-8)
    .map((m) => `${m.senderId === me.id ? 'A' : 'B'}: ${m.text}`).join('\n');
  if (!conversa) return fallback;
  const r = await invocar<{ items: string[] }>('proxima_pergunta', { conversa, nivel: level },
    { items: [fallback] });
  return primeiro(r, fallback);
}

// --------------------------- 3. Por que combinam ----------------------------

export async function explainMatch(me: User, other: User): Promise<string> {
  const c = computeCompatibility(me, other);
  const fallback = `${c.headline} ${c.reasons.slice(0, 2).join(' ')}`;
  const shared = c.sharedInterests.map((i) => INTEREST_MAP[i]?.label ?? i).join(', ')
    || 'nenhum em comum declarado';
  const resumo = [
    `Índice calculado: ${c.score}/100 (confiança ${c.confidence}).`,
    `Decomposição: ${c.dimensions.map((d) => `${d.label} ${Math.round(d.score * 100)}%`).join(', ')}.`,
    `Interesses em comum: ${shared}.`,
    `Observações do algoritmo: ${c.reasons.join(' | ')}`,
    `Nomes: ${firstName(me.name)} e ${firstName(other.name)}.`,
  ].join('\n');
  const r = await invocar<{ items: string[] }>('explicar', { resumo }, { items: [fallback] });
  return primeiro(r, fallback);
}

// --------------------------- 4. Melhorar o perfil ---------------------------

function localProfileTips(u: User): string[] {
  const tips: string[] = [];
  if (!u.photo) tips.push('Adicione uma foto de rosto nítida — ela fica velada no começo, mas é o que se revela depois.');
  if (u.bio.trim().length < 60) tips.push('Sua bio está curta. Duas frases sobre o que você faz num sábado já mudam muito.');
  if (u.interests.length < 5) tips.push('Marque pelo menos 5 interesses: é o que alimenta o cálculo de compatibilidade.');
  if (u.answers.filter((a) => a.answer.trim().length >= 20).length < 3) tips.push('Responda mais três perguntas do perfil — é o que aparece no seu Cartão de Essência.');
  if (!u.verified) tips.push('Verifique sua conta. Perfis verificados recebem cerca de 3x mais conexões.');
  if (!u.extraPhotos.length) tips.push('Uma segunda foto em contexto (viagem, hobby) dá assunto para a conversa.');
  return tips.length ? tips.slice(0, 3) : ['Seu perfil está completo. Foque agora na qualidade das conversas.'];
}

export async function suggestProfileImprovements(u: User): Promise<string[]> {
  const fallback = localProfileTips(u);
  const r = await invocar<{ items: string[] }>('melhorar_perfil', {
    perfil: profileDigest(u, 'PERFIL'), completude: profileCompletion(u),
  }, { items: fallback });
  return r.items?.length ? r.items.slice(0, 3) : fallback;
}

// --------------------------- 5. Resumo de afinidades ------------------------

export async function summarizeAffinities(me: User, other: User): Promise<string> {
  const shared = sharedInterestIds(me, other).map((i) => INTEREST_MAP[i]?.label ?? i);
  const fallback = shared.length
    ? `Vocês dois curtem ${shared.slice(0, 3).join(', ')}. Um bom começo é perguntar como isso entrou na vida dela(e).`
    : 'Vocês não declararam interesses em comum — pergunte o que ela(e) anda fazendo por prazer ultimamente.';
  const r = await invocar<{ items: string[] }>('afinidades', {
    eu: profileDigest(me, 'A'), outra: profileDigest(other, 'B'),
  }, { items: [fallback] });
  return primeiro(r, fallback);
}

// --------------------------- 6. Leitura do termômetro -----------------------

export async function readThermometer(h: ConversationHealth, otherName: string): Promise<string> {
  const fallback = h.nextGoal;
  const resumo = `Termômetro da conversa com ${firstName(otherName)}: nota geral ${h.score}/100, ` +
    `reciprocidade ${h.reciprocity}, profundidade ${h.depth}, constância ${h.consistency}, ` +
    `abertura ${h.openness}, ${h.messages} mensagens em ${h.days} dia(s).`;
  const r = await invocar<{ items: string[] }>('termometro', { resumo, nome: otherName },
    { items: [fallback] });
  return primeiro(r, fallback);
}

// --------------------------- 7. Moderação camada 2 --------------------------

/** Só é chamada quando a heurística local acende amarelo ou vermelho. */
export async function moderateWithAI(text: string, base: ModerationResult): Promise<ModerationResult> {
  const r = await invocar<{
    level: ModerationResult['level']; categories: string[]; advice: string;
  } | null>('moderar', { texto: text }, null);
  if (!r) return base;
  return {
    level: r.level,
    categories: r.categories as ModerationResult['categories'],
    advice: r.advice || base.advice,
    source: 'ia',
  };
}

// --------------------------- 8. Encerrar com gentileza ----------------------

export async function suggestGentleGoodbye(me: User, other: User): Promise<string[]> {
  const nome = firstName(other.name);
  const fallback = [
    `Oi, ${nome}! Gostei de conversar com você, mas percebi que não é bem o que eu procuro agora. Desejo tudo de bom de verdade.`,
    `${nome}, prefiro ser honesto(a): não senti a conexão que eu esperava. Obrigado(a) pelo papo e boa sorte por aí!`,
    'Achei nossa conversa legal, mas acho melhor eu parar por aqui. Sem drama e sem sumir — só sendo sincero(a). Cuide-se!',
  ];
  void me;
  const r = await invocar<{ items: string[] }>('despedida', { nome }, { items: fallback });
  return r.items?.length ? r.items.slice(0, 3) : fallback;
}
