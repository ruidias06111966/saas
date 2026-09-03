import type { Connection, Message } from '../types';

// ---------------------------------------------------------------------------
// A conversa sintética que ancora a paridade entre o TypeScript e o SQL.
//
// Esta MESMA conversa foi inserida no Postgres e passada por
// `private.termometro()`. Os dois lados devolveram os mesmos oito números. Se
// um teste daqui quebrar depois de mexer em services/conversation.ts, a função
// do banco também precisa mudar — senão o véu passa a abrir em medidas
// diferentes conforme quem calculou.
// ---------------------------------------------------------------------------

export const A = '22222222-2222-2222-2222-222222222222';
export const B = '33333333-3333-3333-3333-333333333333';

/** Fixo, porque `dias` e `constância` dependem de "agora". */
export const AGORA = Date.parse('2026-08-30T13:20:20.957Z');

const HORA = 3600_000;

const TEXTOS = [
  'Oi, vi que voce anotou Porto na lista. O que te puxou pra la?',
  'Foi por causa de uma professora minha que morou la dois anos e nao parava de falar da arquitetura da cidade',
  'Faz sentido. Voce viaja mais atras de cidade ou de comida?',
  'Das duas, mas se for pra escolher cidade. Comida boa eu acho em qualquer lugar',
  'Qual foi a viagem que mais mexeu com voce?',
  'Uma que deu tudo errado na verdade. Perdi voo, dormi em aeroporto e conheci gente que ainda falo com',
  'Qual foi a ultima vez que voce aprendeu algo dificil?',
  'Aprender a delegar no escritorio. Passei tres anos achando que so eu fazia direito',
  'Isso e bem mais dificil do que parece. Voce delegou porque quis ou porque a vida forcou?',
  'A vida forcou, com juros. Mas ficou e hoje eu tenho sabado de verdade',
  'Sabado de verdade e subestimado. O meu tem feira de manha e cozinha bagunçada a tarde',
  'Voce cozinha mesmo ou e aquele tipo que cozinha uma coisa muito bem e mais nada?',
  'Cozinho de verdade, mas confesso que meu risoto carrega o curriculo inteiro sozinho',
  'Isso soou como um convite e eu vou tratar como um',
];

export const MENSAGENS: Message[] = TEXTOS.map((text, i) => ({
  id: `m${i}`,
  connectionId: 'c1',
  senderId: i % 2 === 0 ? A : B,
  kind: i === 4 || i === 6 ? 'ritual' : 'texto',
  ritualLevel: i === 4 || i === 6 ? 2 : undefined,
  text,
  // 14 mensagens espalhadas por 6 dias, com 10 h entre turnos.
  createdAt: new Date(AGORA - 6 * 24 * HORA + i * 10 * HORA).toISOString(),
}));

export const CONEXAO: Connection = {
  id: 'c1', userA: A, userB: B, status: 'conectada',
  likes: { [A]: true, [B]: true }, favorite: {}, revealConsent: {},
  compatibility: 80, createdAt: MENSAGENS[0].createdAt,
};

/** O que o Postgres devolveu para esta mesma conversa. */
export const DO_SERVIDOR = {
  score: 58, reciprocity: 100, depth: 77,
  consistency: 94, openness: 40, messages: 14, days: 6,
};
