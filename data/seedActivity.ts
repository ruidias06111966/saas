import type { Connection, Message, ModerationItem, Report, AppNotification } from '../types';
import { computeCompatibility } from '../services/compatibility';
import { moderateText } from '../services/moderation';
import { SEED_USERS } from './seed';
import { dateKey } from '../services/utils';

const H = 3600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const u = (id: string) => SEED_USERS.find((x) => x.id === id)!;
const score = (a: string, b: string) => computeCompatibility(u(a), u(b)).score;

export function buildSeedActivity() {
  const connections: Connection[] = [
    // 1. Conexão viva: conversa em andamento, véu já parcialmente aberto.
    {
      id: 'c_mariana', userA: 'u_demo', userB: 'u_mariana', status: 'conectada',
      likes: { u_demo: true, u_mariana: true }, favorite: { u_demo: true }, revealConsent: {},
      compatibility: score('u_demo', 'u_mariana'),
      createdAt: ago(6 * D), connectedAt: ago(6 * D), curatedOn: dateKey(new Date(Date.now() - 6 * D)),
    },
    // 2. Solicitação recebida: ela demonstrou interesse, você ainda não respondeu.
    {
      id: 'c_helena', userA: 'u_helena', userB: 'u_demo', status: 'pendente',
      likes: { u_helena: true }, favorite: {}, revealConsent: {},
      compatibility: score('u_demo', 'u_helena'),
      createdAt: ago(20 * H), curatedOn: dateKey(),
    },
    // 3. Conexão nova, ainda sem nenhuma mensagem.
    {
      id: 'c_luiza', userA: 'u_demo', userB: 'u_luiza', status: 'conectada',
      likes: { u_demo: true, u_luiza: true }, favorite: {}, revealConsent: {},
      compatibility: score('u_demo', 'u_luiza'),
      createdAt: ago(9 * H), connectedAt: ago(4 * H), curatedOn: dateKey(),
    },
    // 4. Conversa que esfriou: dispara o fluxo anti-ghosting.
    {
      id: 'c_renata', userA: 'u_demo', userB: 'u_renata', status: 'conectada',
      likes: { u_demo: true, u_renata: true }, favorite: {}, revealConsent: {},
      compatibility: score('u_demo', 'u_renata'),
      createdAt: ago(14 * D), connectedAt: ago(14 * D),
    },
    // 5. Interesse enviado, aguardando o outro lado.
    {
      id: 'c_beatriz', userA: 'u_demo', userB: 'u_beatriz', status: 'pendente',
      likes: { u_demo: true }, favorite: {}, revealConsent: {},
      compatibility: score('u_demo', 'u_beatriz'),
      createdAt: ago(2 * D), curatedOn: dateKey(new Date(Date.now() - 2 * D)),
    },
  ];

  const m = (
    id: string, connectionId: string, senderId: string, text: string, msAgo: number,
    kind: Message['kind'] = 'texto', ritualLevel?: 1 | 2 | 3 | 4,
  ): Message => ({
    id, connectionId, senderId, kind, text, ritualLevel,
    createdAt: ago(msAgo), readAt: msAgo > 2 * H ? ago(msAgo - H) : undefined,
  });

  const messages: Message[] = [
    m('m1', 'c_mariana', 'u_demo', 'Oi, Mariana! Vi que você anotou Porto na lista. Eu fui ano passado e ainda penso naquela cidade. O que te puxou pra lá?', 6 * D),
    m('m2', 'c_mariana', 'u_mariana', 'Oi, João! Puxa vida, você foi mesmo? Foi por causa de uma professora minha que morou lá dois anos e não parava de falar da arquitetura. E também porque parece uma cidade que não tem pressa.', 6 * D - 3 * H),
    m('m3', 'c_mariana', 'u_demo', 'É exatamente isso. Tem um ritmo que a gente não tem aqui. Fiquei quatro dias e no terceiro já estava indo na mesma padaria. Você viaja mais atrás de cidade ou de comida?', 5 * D),
    m('m4', 'c_mariana', 'u_mariana', 'Das duas, mas se for pra escolher: cidade. Comida boa eu acho em qualquer lugar, agora um lugar que muda a sua cabeça é raro. Qual foi a viagem que mais mexeu com você?', 5 * D - 2 * H),
    m('m5', 'c_mariana', 'u_demo', 'Uma que deu tudo errado, na verdade. Perdi voo, dormi em aeroporto e conheci gente que ainda falo com. Aprendi que o roteiro importa menos do que eu achava.', 4 * D),
    m('m6', 'c_mariana', 'u_mariana', 'Adorei essa resposta. Eu sou muito de planejar, então isso me dá até um pouco de aflição — e um pouco de inveja.', 4 * D - 5 * H),
    m('m7', 'c_mariana', 'u_demo', 'Qual foi a última vez que você aprendeu algo difícil?', 3 * D, 'ritual', 2),
    m('m8', 'c_mariana', 'u_mariana', 'Aprender a delegar no escritório. Passei três anos achando que só eu fazia direito. Estava errada e foi um alívio descobrir isso.', 3 * D - 4 * H),
    m('m9', 'c_mariana', 'u_demo', 'Isso é bem mais difícil do que parece. Eu ainda estou nessa. Você delegou porque quis ou porque a vida forçou?', 2 * D),
    m('m10', 'c_mariana', 'u_mariana', 'A vida forçou, com juros. Mas ficou. Hoje eu tenho sábado de verdade, o que é uma novidade dos últimos dois anos.', 2 * D - 6 * H),
    m('m11', 'c_mariana', 'u_demo', 'Sábado de verdade é subestimado. O meu geralmente tem feira de manhã e cozinha bagunçada à tarde.', 20 * H),
    m('m12', 'c_mariana', 'u_mariana', 'Você cozinha mesmo ou é aquele tipo que cozinha uma coisa muito bem e mais nada?', 14 * H),
    m('m13', 'c_mariana', 'u_demo', 'Cozinho de verdade, mas confesso que meu risoto carrega o currículo inteiro sozinho.', 11 * H),
    m('m14', 'c_mariana', 'u_mariana', 'Isso soou como um convite e eu vou tratar como um. 😄', 3 * H),

    m('r1', 'c_renata', 'u_demo', 'Oi, Renata! Sua frase sobre jantar em casa ser melhor que restaurante me convenceu na hora.', 14 * D),
    m('r2', 'c_renata', 'u_renata', 'Oi! É a minha bandeira. Restaurante é ótimo, mas ninguém fica até as duas da manhã conversando num restaurante.', 13 * D),
    m('r3', 'c_renata', 'u_demo', 'Justo. Qual foi o melhor jantar em casa que você já foi?', 12 * D),
    m('r4', 'c_renata', 'u_renata', 'Um de aniversário em que ninguém cantou parabéns e todo mundo ficou até tarde. Perfeito.', 11 * D),
    m('r5', 'c_renata', 'u_demo', 'Isso parece muito com o tipo de coisa que eu gosto. Você tem feito muito disso ultimamente?', 8 * D),
  ];

  const flagged = 'Oi linda, tudo bem? Me manda um pix de R$ 200 que eu te devolvo amanhã, prometo';
  const moderationQueue: ModerationItem[] = [
    {
      id: 'mod1', messageId: 'x_ext_1', connectionId: 'c_externa', authorId: 'u_juliana',
      excerpt: flagged, result: moderateText(flagged), status: 'pendente', createdAt: ago(5 * H),
    },
  ];

  const reports: Report[] = [
    {
      id: 'rep1', reporterId: 'u_camila', reportedId: 'u_juliana', reason: 'golpe',
      description: 'Pediu dinheiro na terceira mensagem.', status: 'aberta',
      evidenceMessageIds: [], createdAt: ago(5 * H),
    },
    {
      id: 'rep2', reporterId: 'u_tais', reportedId: 'u_camila', reason: 'spam',
      description: 'Mandou link de divulgação de evento.', status: 'em_analise',
      evidenceMessageIds: [], createdAt: ago(2 * D),
    },
  ];

  const notifications: AppNotification[] = [
    { id: 'n1', userId: 'u_demo', kind: 'mensagem', title: 'Mariana enviou uma mensagem', body: '"Isso soou como um convite e eu vou tratar como um. 😄"', link: { name: 'chat', id: 'c_mariana' }, read: false, createdAt: ago(3 * H) },
    { id: 'n2', userId: 'u_demo', kind: 'solicitacao', title: 'Helena demonstrou interesse', body: 'Você tem uma solicitação esperando resposta.', link: { name: 'connections' }, read: false, createdAt: ago(20 * H) },
    { id: 'n3', userId: 'u_demo', kind: 'curadoria', title: 'Sua curadoria de hoje chegou', body: 'Encontramos pessoas compatíveis com você.', link: { name: 'discover' }, read: true, createdAt: ago(9 * H) },
  ];

  return { connections, messages, moderationQueue, reports, notifications };
}
