// Perguntas de perfil ("vitrines de essência") e a Escada de Intimidade usada
// pelos Rituais de Conversa. Nenhuma pergunta é invasiva: nada sobre renda,
// endereço, histórico sexual, religião de outra pessoa ou dados sensíveis.

export interface ProfilePrompt {
  id: string;
  label: string;
  placeholder: string;
  maxLength: number;
}

export const PROFILE_PROMPTS: ProfilePrompt[] = [
  { id: 'encontro_ideal', label: 'Meu encontro ideal seria...', placeholder: 'Um lugar, um clima, uma hora do dia.', maxLength: 220 },
  { id: 'adoro_fazer', label: 'Uma coisa que eu adoro fazer é...', placeholder: 'Aquilo que faz o tempo passar sem você ver.', maxLength: 220 },
  { id: 'lugar_conhecer', label: 'Um lugar que eu gostaria de conhecer...', placeholder: 'E por quê.', maxLength: 220 },
  { id: 'relacionamento_significa', label: 'Para mim, relacionamento significa...', placeholder: 'Sem clichê, do seu jeito.', maxLength: 260 },
  { id: 'valorizo', label: 'O que eu mais valorizo em alguém...', placeholder: 'Uma qualidade que você percebe rápido.', maxLength: 220 },
  { id: 'domingo', label: 'Meu domingo perfeito tem...', placeholder: 'Descreva em três coisas.', maxLength: 200 },
  { id: 'me_ganha', label: 'Você me ganha se...', placeholder: 'Um gesto pequeno que funciona com você.', maxLength: 200 },
  { id: 'aprendendo', label: 'Estou aprendendo a...', placeholder: 'Algo que você está no meio do caminho.', maxLength: 200 },
  { id: 'opiniao_impopular', label: 'Minha opinião impopular é...', placeholder: 'Leve. Nada de política pesada aqui.', maxLength: 200 },
  { id: 'trilha_sonora', label: 'A trilha sonora da minha semana é...', placeholder: 'Artista, música ou o clima geral.', maxLength: 160 },
  { id: 'orgulho', label: 'Uma coisa de que tenho orgulho...', placeholder: 'Pode ser pequena.', maxLength: 220 },
  { id: 'nao_negociavel', label: 'Meu inegociável é...', placeholder: 'Aquilo que você não abre mão.', maxLength: 200 },
  { id: 'me_faz_rir', label: 'O que sempre me faz rir...', placeholder: 'Vale meme, tipo de humor, pessoa.', maxLength: 180 },
  { id: 'daqui_cinco_anos', label: 'Daqui a cinco anos, eu quero...', placeholder: 'Uma direção, não um plano fechado.', maxLength: 220 },
];

export const PROFILE_PROMPT_MAP: Record<string, ProfilePrompt> = Object.fromEntries(
  PROFILE_PROMPTS.map((p) => [p.id, p]),
);

// --------------------------- Escada de Intimidade ---------------------------
// Nível 1: leve e concreto | 2: preferências e histórias | 3: valores
// Nível 4: vulnerabilidade consentida (só depois de conversa consistente).

export interface LadderQuestion {
  level: 1 | 2 | 3 | 4;
  text: string;
}

export const LADDER: LadderQuestion[] = [
  { level: 1, text: 'Qual foi a melhor coisa que aconteceu na sua semana?' },
  { level: 1, text: 'Café da manhã salgado ou doce? Defenda sua tese.' },
  { level: 1, text: 'Qual música você colocaria para tocar agora?' },
  { level: 1, text: 'Se hoje acabasse agora, o que você faria com as próximas duas horas?' },
  { level: 1, text: 'Qual é o seu lugar favorito na sua cidade?' },
  { level: 1, text: 'Você é mais de planejar a viagem ou decidir na hora?' },
  { level: 1, text: 'Qual comida você faz melhor do que a maioria?' },
  { level: 1, text: 'Qual série ou filme você recomendaria sem pensar duas vezes?' },

  { level: 2, text: 'Qual foi a viagem que mais mudou alguma coisa em você?' },
  { level: 2, text: 'Que hobby você já teve e largou — e por quê?' },
  { level: 2, text: 'Qual foi a última vez que você aprendeu algo difícil?' },
  { level: 2, text: 'Como é um dia bom para você, do começo ao fim?' },
  { level: 2, text: 'Qual história sua as pessoas sempre pedem para você contar de novo?' },
  { level: 2, text: 'Qual decisão sua parecia pequena na hora e virou grande depois?' },
  { level: 2, text: 'Que tipo de conversa faz você perder a hora?' },
  { level: 2, text: 'Você prefere silêncio confortável ou papo constante?' },

  { level: 3, text: 'O que você aprendeu com um relacionamento anterior — sobre você, não sobre a outra pessoa?' },
  { level: 3, text: 'O que significa cuidado para você, na prática?' },
  { level: 3, text: 'Como você percebe que está confiando em alguém?' },
  { level: 3, text: 'O que te faz sentir respeitado(a)?' },
  { level: 3, text: 'Qual valor você não abre mão, mesmo quando custa caro?' },
  { level: 3, text: 'Como você lida quando discorda de alguém de quem gosta?' },
  { level: 3, text: 'O que você quer construir nos próximos anos?' },
  { level: 3, text: 'Que tipo de apoio funciona com você em um dia ruim?' },

  { level: 4, text: 'O que você tem medo de repetir?' },
  { level: 4, text: 'Em que situação você costuma se fechar sem perceber?' },
  { level: 4, text: 'O que você gostaria que alguém entendesse sobre você sem precisar explicar?' },
  { level: 4, text: 'Qual foi a última vez que você mudou de ideia sobre algo importante?' },
  { level: 4, text: 'Do que você sente falta que nem sabia que existia?' },
  { level: 4, text: 'O que te faz sentir que está no lugar certo com a pessoa certa?' },
];

/** Aberturas neutras usadas quando a IA está indisponível. */
export const OPENERS: string[] = [
  'Vi que a gente compartilha {interesse}. Como isso entrou na sua vida?',
  'Sua resposta sobre "{prompt}" me pegou. Posso perguntar mais sobre isso?',
  'Se eu tivesse que apostar, diria que você é mais de {palpite}. Errei feio?',
  'Qual é a sua versão de um dia bom em {cidade}?',
  'Curiosidade genuína: {interesse} é fase ou é coisa de longa data pra você?',
];
