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

const RULES: Rule[] = [
  {
    category: 'financeiro',
    level: 'risco',
    pattern: /\b(pix|transfer[êe]ncia|empr[ée]stimo|dep[óo]sito|cripto|bitcoin|investimento garantido|me manda? (um|uns)? ?(dinheiro|grana)|cart[ãa]o de cr[ée]dito|c[óo]digo de verifica[çc][ãa]o)\b/i,
    advice: 'Pedidos de dinheiro, transferência ou códigos são o golpe mais comum em apps de relacionamento. Nunca envie.',
  },
  {
    category: 'contato_externo',
    level: 'atencao',
    pattern: /\b(whats?app|zap|telegram|meu n[úu]mero|me chama no|instagram|\+?55\s?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4})\b/i,
    advice: 'Levar a conversa para fora do app cedo demais remove suas proteções. Tudo bem esperar mais um pouco.',
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
export const SAFETY_TIPS = [
  'Nunca envie dinheiro, Pix ou códigos de verificação para alguém que você conheceu aqui.',
  'Combine o primeiro encontro em local público e conte para alguém de confiança.',
  'Seu endereço exato nunca é exibido — só a cidade e uma faixa de distância.',
  'Se algo parecer estranho, você pode bloquear e denunciar a qualquer momento.',
  'Desconfie de quem tem pressa para sair do app ou evita chamada de vídeo.',
];
