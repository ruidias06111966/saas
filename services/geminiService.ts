import type { ConversationHealth, Message, ModerationResult, User } from '../types';
import { profileCompletion, oQueFalta } from './perfil';
import { supabase, supabaseEnabled } from './supabaseClient';
import { firstName, seededRandom, shuffle } from './utils';

// ---------------------------------------------------------------------------
// Copiloto — lado do cliente.
//
// A chave do Gemini NÃO existe aqui. Toda geração passa pela Edge Function
// `copiloto` (supabase/functions/copiloto), que exige JWT e é dona dos prompts.
// O cliente manda apenas dados de perfil já públicos e escolhe uma ação de uma
// lista fechada.
//
// O QUE MUDOU NO PIVÔ
//
// O copiloto ajudava a namorar: explicava afinidade, sugeria assunto, media o
// véu. Agora ajuda a TRABALHAR — a abrir conversa sobre um serviço, a perguntar
// o que falta para orçar, a despedir-se sem sumir. As perguntas curadas abaixo
// trocaram de assunto junto.
//
// REGRAS DO PRODUTO, não negociáveis:
//  1. A IA NUNCA envia mensagem sozinha. Ela sugere; a pessoa edita e envia.
//  2. A IA NUNCA se passa pelo usuário nem inventa fatos sobre ele.
//  3. Sem backend, tudo continua funcionando: cada função tem um fallback
//     determinístico local, alimentado por um banco curado de perguntas.
//  4. Nenhum dado sensível (e-mail, telefone, coordenada) entra no payload.
// ---------------------------------------------------------------------------

type Acao =
  | 'aberturas' | 'proxima_pergunta' | 'melhorar_perfil'
  | 'termometro' | 'moderar' | 'despedida';

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

/**
 * Retrato mínimo e seguro de um perfil. Só o que já é público no app.
 *
 * Repare no que NÃO entra: telefone, e-mail, coordenada. O telefone é o caso
 * novo e o mais fácil de errar — ele existe em `User` desde o pivô, mas é
 * justamente o dado que o produto promete não mostrar antes do acordo.
 */
function profileDigest(u: User, label: string): string {
  return [
    `${label}: ${u.name}`,
    u.profession && `Profissão: ${u.profession}`,
    `Cidade: ${u.city}, ${u.state}`,
    typeof u.anosExperiencia === 'number' && `Experiência: ${u.anosExperiencia} anos`,
    u.atendeRemoto ? 'Atende a distância' : 'Atende presencialmente',
    u.bio && `Resumo: ${u.bio}`,
  ].filter(Boolean).join('\n');
}

// --------------------------- banco curado local -----------------------------
// Sem backend (ou sem chave), o app continua útil. Estas perguntas não são
// enfeite: são as que um profissional experiente faz antes de dar preço.

const ABERTURAS = [
  'Vi seu perfil e trabalho com algo parecido. Posso te fazer duas perguntas sobre o que você precisa?',
  'Trabalho nessa área aqui na região. O que você precisa é para agora ou dá para planejar?',
  'Olá! Faço esse tipo de serviço. Você já tentou resolver isso antes de algum jeito?',
  'Bom dia. Antes de te passar valor, prefiro entender o tamanho do serviço. Pode me contar um pouco?',
  'Trabalho com isso há um tempo. Qual é o prazo que você tem em mente?',
];

const PERGUNTAS = [
  'Qual é o prazo que você tem em mente para isso ficar pronto?',
  'Já existe alguma coisa feita, ou começamos do zero?',
  'Quem mais vai participar da decisão além de você?',
  'Tem algum documento ou material que eu deveria ver antes de orçar?',
  'O que faria você considerar esse trabalho bem feito no fim?',
  'Já houve alguma tentativa antes? O que não funcionou?',
  'Tem alguma exigência de prazo legal ou de órgão envolvida?',
  'Prefere um valor fechado ou por hora?',
];

const DESPEDIDAS = [
  'Obrigado pelo tempo. Pelo que você descreveu, não sou a pessoa certa para isso — prefiro dizer agora do que te atrasar.',
  'Vou ser sincero: esse escopo está além do que eu faço bem. Se quiser, posso indicar alguém.',
  'Neste momento não consigo pegar mais trabalho com a qualidade que você merece. Podemos falar mais para frente?',
];

const escolher = (lista: string[], semente: string, quantos: number) =>
  shuffle(lista, seededRandom(semente)).slice(0, quantos);

// -------------------------------- funções -----------------------------------

/** Três jeitos de começar a conversa sobre um trabalho. */
export async function suggestOpeners(me: User, other: User): Promise<string[]> {
  return invocar<string[]>(
    'aberturas',
    { eu: profileDigest(me, 'Eu'), outra: profileDigest(other, 'A outra pessoa') },
    escolher(ABERTURAS, me.id + other.id, 3),
  );
}

/** A próxima pergunta útil, olhando o que já foi dito. */
export async function suggestNextQuestion(
  me: User, other: User, messages: Message[], nivel = 1,
): Promise<string> {
  const conversa = messages.slice(-12)
    .map((m) => `${m.senderId === me.id ? 'Eu' : firstName(other.name)}: ${m.text}`)
    .join('\n');
  return invocar<string>(
    'proxima_pergunta',
    { eu: profileDigest(me, 'Eu'), outra: profileDigest(other, 'A outra pessoa'), conversa, nivel },
    escolher(PERGUNTAS, me.id + messages.length, 1)[0],
  );
}

/** O que falta no perfil para ele ser escolhido num anúncio. */
export async function suggestProfileImprovements(u: User): Promise<string[]> {
  const falta = oQueFalta(u);
  const local = falta.length > 0
    ? falta.slice(0, 3).map((f) => `Falta ${f}.`)
    : ['Seu perfil está completo. Agora é responder rápido: quem responde no mesmo dia é escolhido muito mais.'];
  return invocar<string[]>(
    'melhorar_perfil',
    { perfil: profileDigest(u, 'Perfil'), completude: profileCompletion(u) },
    local,
  );
}

/** Uma leitura em português do termômetro da conversa. */
export async function readThermometer(h: ConversationHealth, otherName: string): Promise<string> {
  return invocar<string>(
    'termometro',
    { resumo: `etapa ${h.stageLabel}, ${h.messages} mensagens em ${h.days} dias`, nome: otherName },
    h.nextGoal,
  );
}

/** Camada 2 da moderação. A camada 1 é heurística e local. */
export async function moderateWithAI(text: string, base: ModerationResult): Promise<ModerationResult> {
  return invocar<ModerationResult>('moderar', { texto: text }, base);
}

/** Encerrar sem sumir. Sumir é o que mais machuca reputação num mercado. */
export async function suggestGentleGoodbye(me: User, other: User): Promise<string[]> {
  return invocar<string[]>(
    'despedida',
    { eu: profileDigest(me, 'Eu'), outra: profileDigest(other, 'A outra pessoa') },
    escolher(DESPEDIDAS, me.id + other.id, 2),
  );
}
