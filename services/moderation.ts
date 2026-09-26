import type { ModerationResult, RiskCategory } from '../types';

// ---------------------------------------------------------------------------
// Moderação — camada 1 (heurística local, sempre ativa, sem custo e sem rede).
// A camada 2 (Gemini) vive em geminiService.moderateWithAI e só é chamada
// quando a heurística acende amarelo. Bloqueio definitivo NUNCA é automático:
// tudo cai na fila de revisão humana do painel administrativo.
// ---------------------------------------------------------------------------

interface Rule {
  category: RiskCategory;
  level: 'atencao' | 'risco';
  pattern: RegExp;
  advice: string;
}

// ---------------------------------------------------------------------------
// DOIS PESOS, DE PROPÓSITO.
//
// `risco`   marca a mensagem, aparece para os dois lados, e o BANCO enfileira
//           para revisão humana (gatilho da migração 020).
// `atencao` NÃO marca nada. É conselho para quem está escrevendo, mostrado uma
//           vez, e some.
//
// A diferença nasceu de um caso real: o dono escreveu que combinaria o telefone
// pelo WhatsApp, a mensagem ganhou "em revisão" e a etiqueta nunca saiu — nem
// podia, porque não existia fila nenhuma. E os DOIS lados viam a etiqueta.
//
// Num mercado de serviços, combinar contato depois de uma proposta aceita é o
// objetivo do produto. Tratar isso como suspeita era herança do app de
// relacionamentos.
// ---------------------------------------------------------------------------

const RULES: Rule[] = [
  {
    category: 'financeiro',
    level: 'risco',
    pattern: /\b(pix|transfer[êe]ncia|empr[ée]stimo|dep[óo]sito|cripto|bitcoin|investimento garantido|me manda? (um|uns)? ?(dinheiro|grana)|cart[ãa]o de cr[ée]dito|c[óo]digo de verifica[çc][ãa]o)\b/i,
    advice: 'Pedido de dinheiro adiantado, PIX ou código de verificação é o golpe mais comum em mercado de serviços. Combine o pagamento só depois de saber com quem está falando.',
  },
  {
    category: 'contato_externo',
    level: 'atencao',
    pattern: /\b(whats?app|zap|telegram|meu n[úu]mero|me chama no|instagram|\+?55\s?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4})\b/i,
    // Num mercado de serviços, combinar o telefone é o OBJETIVO — existe até
    // uma função no banco só para revelar o contato depois de uma proposta
    // aceita. O texto antigo ("levar a conversa para fora do app remove suas
    // proteções") era do app de relacionamentos e brigava com o produto.
    //
    // Continua sendo `atencao`, e `atencao` não marca mais a mensagem: vira
    // um conselho para quem escreve, e mais nada. Ver `sendMessage`.
    advice: 'Combinando por fora, o combinado não fica registrado aqui. Se der problema depois, o que estiver escrito nesta conversa é o que existe.',
  },
  {
    category: 'sexual_explicito',
    level: 'risco',
    pattern: /\b(nudes?|foto pelad[ao]|manda uma foto s[ée]ria mesmo sem roupa|sexo agora|garanhao|só quero sexo)\b/i,
    advice: 'Conteúdo sexual sem consentimento explícito viola as Diretrizes da Comunidade.',
  },
  {
    category: 'odio',
    level: 'risco',
    pattern: /\b(viado|bicha|macaco|preto imundo|traveco|volta pro? teu pa[íi]s|nazi(sta)?)\b/i,
    advice: 'Discurso de ódio leva à suspensão imediata após revisão.',
  },
  {
    category: 'assedio',
    level: 'risco',
    pattern: /\b(vou te achar|sei onde voc[êe] mora|te sigo|se n[ãa]o responder|vagabund[ao]|puta que pariu voc[êe])\b/i,
    advice: 'Insistência, ameaça ou intimidação são assédio. Denuncie e bloqueie.',
  },
  {
    category: 'spam',
    level: 'atencao',
    pattern: /(https?:\/\/|www\.)\S+|\b(ganhe dinheiro|renda extra|clique aqui|promo[çc][ãa]o imperd[íi]vel)\b/i,
    advice: 'Links e ofertas em conversas iniciais costumam ser spam ou golpe.',
  },
  {
    category: 'menor_de_idade',
    level: 'risco',
    pattern: /\b(tenho 1[0-7] anos|sou de menor|menor de idade|estou no (7|8|9)º ano|estou no fundamental)\b/i,
    advice: 'Suspeita de menor de idade. Isto é bloqueado e enviado para revisão humana imediata.',
  },
];

export function moderateText(text: string): ModerationResult {
  const hits = RULES.filter((r) => r.pattern.test(text));
  if (!hits.length) {
    return { level: 'ok', categories: [], advice: '', source: 'heuristica' };
  }
  const risk = hits.find((h) => h.level === 'risco');
  return {
    level: risk ? 'risco' : 'atencao',
    categories: Array.from(new Set(hits.map((h) => h.category))),
    advice: (risk ?? hits[0]).advice,
    source: 'heuristica',
  };
}

/** Mensagens de "risco" não são enviadas sem uma confirmação consciente. */
export const blocksSending = (r: ModerationResult): boolean => r.level === 'risco';

export const CATEGORY_LABEL: Record<RiskCategory, string> = {
  financeiro: 'Pedido financeiro',
  contato_externo: 'Contato fora do app',
  sexual_explicito: 'Conteúdo sexual',
  odio: 'Discurso de ódio',
  assedio: 'Assédio',
  spam: 'Spam ou link',
  menor_de_idade: 'Suspeita de menor',
};

/** Dicas de segurança rotativas exibidas no início de cada conversa. */
/**
 * As dicas da tela Início. Eram de encontro amoroso — "combine o primeiro
 * encontro em local público", "desconfie de quem evita chamada de vídeo" —, e
 * passaram despercebidas no pivô porque ninguém as lê com atenção.
 *
 * Agora falam do risco que este produto tem de verdade: pagar adiantado a quem
 * você não sabe quem é, e contratar quem diz ser habilitado sem ser.
 */
export const SAFETY_TIPS = [
  'Nunca pague o serviço inteiro adiantado. Combine contra entrega, ou em etapas.',
  'Profissão que exige conselho (CREA, CRC, OAB, CRM): peça o número e confira no site do conselho.',
  'Deixe por escrito o que foi combinado — preço, prazo e o que está incluído.',
  'Seu endereço exato nunca é exibido — só a cidade e uma faixa de distância.',
  'Se algo parecer estranho, você pode bloquear e denunciar a qualquer momento.',
];
