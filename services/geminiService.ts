import { GoogleGenAI, Type } from '@google/genai';
import type { ConversationHealth, Message, ModerationResult, User } from '../types';
import { LADDER, OPENERS, PROFILE_PROMPT_MAP } from '../data/prompts';
import { INTEREST_MAP } from '../data/interests';
import { computeCompatibility, profileCompletion, sharedInterestIds } from './compatibility';
import { age, firstName, seededRandom, shuffle } from './utils';

// ---------------------------------------------------------------------------
// Copiloto de Conversa (Gemini)
//
// REGRAS DO PRODUTO, não negociáveis:
//  1. A IA NUNCA envia mensagem sozinha. Ela sugere; a pessoa edita e envia.
//  2. A IA NUNCA se passa pelo usuário nem inventa fatos sobre ele.
//  3. Tudo funciona sem chave de API: cada função tem fallback determinístico.
//  4. Nenhum dado sensível (e-mail, senha, coordenada) entra no prompt.
// ---------------------------------------------------------------------------

const MODEL = 'gemini-2.5-flash';
const apiKey = process.env.API_KEY;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  if (!apiKey) return null;
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

export const aiEnabled = Boolean(apiKey);

const SYSTEM = `Você é o Copiloto do CONEXÃO, um aplicativo brasileiro de relacionamentos.
Seu papel é ajudar a pessoa a conversar melhor — nunca conversar por ela.
Diretrizes:
- Português do Brasil, tom caloroso, direto e adulto. Nada de bajulação nem de clichê de cantada.
- Sugestões curtas (máximo 2 frases), específicas ao que os perfis realmente dizem.
- Nunca invente fatos sobre nenhuma das pessoas.
- Nunca peça ou sugira pedir dados pessoais: telefone, endereço, redes sociais, dinheiro.
- Nada de conteúdo sexual, apelo à aparência física ou pressão para encontro.
- Se não houver base suficiente nos perfis, faça uma pergunta aberta e neutra.`;

/** Retrato mínimo e seguro de um perfil para enviar ao modelo. */
function profileDigest(u: User, label: string): string {
  const answers = u.answers
    .filter((a) => a.answer.trim())
    .slice(0, 4)
    .map((a) => `  - "${PROFILE_PROMPT_MAP[a.promptId]?.label ?? a.promptId}" → ${a.answer}`)
    .join('\n');
  return [
    `${label}: ${firstName(u.name)}, ${age(u.birthDate)} anos, ${u.city}.`,
    `Profissão: ${u.profession || 'não informada'}.`,
    `Objetivo: ${u.goal}.`,
    `Bio: ${u.bio || '—'}`,
    `Interesses: ${u.interests.map((i) => INTEREST_MAP[i]?.label ?? i).join(', ') || '—'}`,
    answers ? `Respostas do perfil:\n${answers}` : '',
  ].filter(Boolean).join('\n');
}

async function askJson<T>(prompt: string, schema: object, fallback: T, temperature = 0.9): Promise<T> {
  const ai = getClient();
  if (!ai) return fallback;
  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature,
      },
    });
    const text = (res.text ?? '').trim();
    if (!text) return fallback;
    return JSON.parse(text) as T;
  } catch (err) {
    console.warn('[Copiloto] Falha na chamada ao Gemini, usando fallback local.', err);
    return fallback;
  }
}

const stringListSchema = (max: number) => ({
  type: Type.OBJECT,
  properties: {
    items: { type: Type.ARRAY, maxItems: max, items: { type: Type.STRING } },
  },
  required: ['items'],
});

// --------------------------- 1. Aberturas -----------------------------------

function localOpeners(me: User, other: User): string[] {
  const shared = sharedInterestIds(me, other);
  const rnd = seededRandom(`${me.id}:${other.id}:opener`);
  const answered = other.answers.filter((a) => a.answer.trim());
  const out = shuffle(OPENERS, rnd).map((tpl) =>
    tpl
      .replace('{interesse}', INTEREST_MAP[shared[0]]?.label.toLowerCase() ?? 'algumas coisas')
      .replace('{prompt}', PROFILE_PROMPT_MAP[answered[0]?.promptId]?.label ?? 'seu perfil')
      .replace('{cidade}', other.city)
      .replace('{palpite}', INTEREST_MAP[other.interests[0]]?.label.toLowerCase() ?? 'pessoa de rotina'),
  );
  return out.slice(0, 3);
}

export async function suggestOpeners(me: User, other: User): Promise<string[]> {
  const fallback = localOpeners(me, other);
  const prompt = `${profileDigest(me, 'PESSOA A (quem vai enviar)')}

${profileDigest(other, 'PESSOA B (quem vai receber)')}

Escreva 3 primeiras mensagens que a PESSOA A pode enviar para a PESSOA B.
Cada uma deve citar algo concreto do perfil de B, terminar com uma pergunta aberta e
soar como uma pessoa real escrevendo, não como um app. Máximo 220 caracteres cada.`;
  const res = await askJson<{ items: string[] }>(prompt, stringListSchema(3), { items: fallback });
  return res.items?.length ? res.items.slice(0, 3) : fallback;
}

// --------------------------- 2. Próxima pergunta ----------------------------

function localNextQuestion(level: 1 | 2 | 3 | 4, seed: string): string {
  const pool = LADDER.filter((q) => q.level === level);
  const rnd = seededRandom(seed);
  return shuffle(pool, rnd)[0]?.text ?? 'O que fez o seu dia melhor hoje?';
}

export async function suggestNextQuestion(
  me: User, other: User, messages: Message[], level: 1 | 2 | 3 | 4,
): Promise<string> {
  const fallback = localNextQuestion(level, `${me.id}:${other.id}:${messages.length}`);
  const recent = messages.filter((m) => m.kind !== 'sistema').slice(-8)
    .map((m) => `${m.senderId === me.id ? 'A' : 'B'}: ${m.text}`).join('\n');
  if (!recent) return fallback;
  const levelHint = ['leve e concreta', 'sobre histórias e preferências', 'sobre valores e como a pessoa se relaciona', 'sobre vulnerabilidade, com muito cuidado'][level - 1];
  const prompt = `Conversa recente entre A e B:
${recent}

Sugira UMA pergunta que A pode fazer agora. Ela deve ser ${levelHint},
conectada ao que já foi dito, e nunca invasiva. Devolva só a pergunta.`;
  const res = await askJson<{ items: string[] }>(prompt, stringListSchema(1), { items: [fallback] }, 1.0);
  return res.items?.[0] ?? fallback;
}

// --------------------------- 3. Por que combinam ----------------------------

export async function explainMatch(me: User, other: User): Promise<string> {
  const c = computeCompatibility(me, other);
  const fallback = `${c.headline} ${c.reasons.slice(0, 2).join(' ')}`;
  const shared = c.sharedInterests.map((i) => INTEREST_MAP[i]?.label ?? i).join(', ') || 'nenhum em comum declarado';
  const prompt = `Índice calculado: ${c.score}/100 (confiança ${c.confidence}).
Decomposição: ${c.dimensions.map((d) => `${d.label} ${Math.round(d.score * 100)}%`).join(', ')}.
Interesses em comum: ${shared}.
Observações do algoritmo: ${c.reasons.join(' | ')}

Escreva 2 frases explicando, para ${firstName(me.name)}, por que faz sentido conversar com ${firstName(other.name)}.
Seja honesto: se o índice for baixo, diga onde está o atrito. Nunca prometa que vai dar certo.`;
  const res = await askJson<{ items: string[] }>(prompt, stringListSchema(1), { items: [fallback] }, 0.7);
  return res.items?.[0] ?? fallback;
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
  const prompt = `${profileDigest(u, 'PERFIL')}
Completude calculada: ${profileCompletion(u)}%.

Dê 3 sugestões concretas para este perfil atrair conversas melhores (não mais curtidas).
Cada sugestão em uma frase, no imperativo, apontando o campo exato a mexer.`;
  const res = await askJson<{ items: string[] }>(prompt, stringListSchema(3), { items: fallback }, 0.8);
  return res.items?.length ? res.items.slice(0, 3) : fallback;
}

// --------------------------- 5. Resumo de afinidades ------------------------

export async function summarizeAffinities(me: User, other: User): Promise<string> {
  const shared = sharedInterestIds(me, other).map((i) => INTEREST_MAP[i]?.label ?? i);
  const fallback = shared.length
    ? `Vocês dois curtem ${shared.slice(0, 3).join(', ')}. Um bom começo é perguntar como isso entrou na vida dela(e).`
    : 'Vocês não declararam interesses em comum — pergunte o que ela(e) anda fazendo por prazer ultimamente.';
  const prompt = `${profileDigest(me, 'A')}

${profileDigest(other, 'B')}

Em no máximo 2 frases, aponte a ponte mais interessante entre A e B e sugira o que perguntar a partir dela.`;
  const res = await askJson<{ items: string[] }>(prompt, stringListSchema(1), { items: [fallback] }, 0.8);
  return res.items?.[0] ?? fallback;
}

// --------------------------- 6. Leitura do termômetro -----------------------

export async function readThermometer(h: ConversationHealth, otherName: string): Promise<string> {
  const fallback = h.nextGoal;
  const prompt = `Termômetro da conversa com ${firstName(otherName)}:
nota geral ${h.score}/100, reciprocidade ${h.reciprocity}, profundidade ${h.depth},
constância ${h.consistency}, abertura ${h.openness}, ${h.messages} mensagens em ${h.days} dia(s).

Em 1 frase, diga o que fazer a seguir para a conversa melhorar. Sem julgar a pessoa.`;
  const res = await askJson<{ items: string[] }>(prompt, stringListSchema(1), { items: [fallback] }, 0.6);
  return res.items?.[0] ?? fallback;
}

// --------------------------- 7. Moderação camada 2 --------------------------

const moderationSchema = {
  type: Type.OBJECT,
  properties: {
    level: { type: Type.STRING, enum: ['ok', 'atencao', 'risco'] },
    categories: { type: Type.ARRAY, items: { type: Type.STRING } },
    advice: { type: Type.STRING },
  },
  required: ['level', 'categories', 'advice'],
};

/** Só é chamada quando a heurística local acende amarelo ou vermelho. */
export async function moderateWithAI(text: string, base: ModerationResult): Promise<ModerationResult> {
  const ai = getClient();
  if (!ai) return base;
  const prompt = `Classifique a mensagem abaixo de um app de relacionamentos.
Categorias possíveis: financeiro, contato_externo, sexual_explicito, odio, assedio, spam, menor_de_idade.
Responda "ok" se for uma mensagem comum. Considere o contexto brasileiro e gírias.

MENSAGEM: """${text.slice(0, 1200)}"""`;
  const res = await askJson(prompt, moderationSchema, null as null | {
    level: ModerationResult['level']; categories: string[]; advice: string;
  }, 0.1);
  if (!res) return base;
  return {
    level: res.level,
    categories: res.categories as ModerationResult['categories'],
    advice: res.advice || base.advice,
    source: 'ia',
  };
}

// --------------------------- 8. Encerrar com gentileza ----------------------

export async function suggestGentleGoodbye(me: User, other: User): Promise<string[]> {
  const fallback = [
    `Oi, ${firstName(other.name)}! Gostei de conversar com você, mas percebi que não é bem o que eu procuro agora. Desejo tudo de bom de verdade.`,
    `${firstName(other.name)}, prefiro ser honesto(a): não senti a conexão que eu esperava. Obrigado(a) pelo papo e boa sorte por aí!`,
    `Achei nossa conversa legal, mas acho melhor eu parar por aqui. Sem drama e sem sumir — só sendo sincero(a). Cuide-se!`,
  ];
  const prompt = `${firstName(me.name)} quer encerrar a conversa com ${firstName(other.name)} sem sumir.
Escreva 3 mensagens curtas de despedida: educadas, honestas, sem culpa, sem falsa promessa de "vamos nos falar depois".`;
  const res = await askJson<{ items: string[] }>(prompt, stringListSchema(3), { items: fallback }, 0.8);
  return res.items?.length ? res.items.slice(0, 3) : fallback;
}
