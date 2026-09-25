import type { Connection, Message, ModerationItem, Report, AppNotification } from '../types';
import { moderateText } from '../services/moderation';

// ---------------------------------------------------------------------------
// A atividade das contas de demonstração.
//
// Reescrita junto com o seed: as conversas eram de namoro — viagem, risoto,
// "isso soou como um convite". Agora são conversas de trabalho, que é onde o
// app vive desde o pivô.
//
// A conversa longa tem um propósito além de encher tela: ela exercita o
// termômetro. Reciprocidade, profundidade e constância são medidas sobre ela,
// e uma troca real de negociação — escopo, prazo, preço, contraproposta — é o
// que faz esses números significarem alguma coisa.
// ---------------------------------------------------------------------------

const H = 3600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export function buildSeedActivity() {
  const connections: Connection[] = [
    // 1. Conversa viva: negociação em andamento, já perto do combinado.
    {
      id: 'c_joana', userA: 'u_demo', userB: 'u_joana', status: 'conectada',
      likes: { u_demo: true, u_joana: true }, favorite: { u_demo: true },
      createdAt: ago(6 * D), connectedAt: ago(6 * D),
    },
    // 2. Solicitação recebida, ainda sem resposta.
    {
      id: 'c_renata', userA: 'u_renata', userB: 'u_demo', status: 'pendente',
      likes: { u_renata: true }, favorite: {},
      createdAt: ago(20 * H),
    },
    // 3. Conversa nova, ainda sem nenhuma mensagem.
    {
      id: 'c_bruno', userA: 'u_demo', userB: 'u_bruno', status: 'conectada',
      likes: { u_demo: true, u_bruno: true }, favorite: {},
      createdAt: ago(9 * H), connectedAt: ago(4 * H),
    },
    // 4. Conversa que esfriou: dispara o aviso de cortesia.
    {
      id: 'c_paulo', userA: 'u_demo', userB: 'u_paulo', status: 'conectada',
      likes: { u_demo: true, u_paulo: true }, favorite: {},
      createdAt: ago(14 * D), connectedAt: ago(14 * D),
    },
    // 5. Contato enviado, aguardando o outro lado.
    {
      id: 'c_marcos', userA: 'u_demo', userB: 'u_marcos', status: 'pendente',
      likes: { u_demo: true }, favorite: {},
      createdAt: ago(2 * D),
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
    m('m1', 'c_joana', 'u_demo', 'Oi, Joana. Vi seu perfil no quadro. Tenho um cliente em Goiânia que precisa abrir empresa e não quero passar o serviço para quem não atende direito. Você está pegando trabalho novo?', 6 * D),
    m('m2', 'c_joana', 'u_joana', 'Oi, Rui! Estou sim. Abertura eu faço bastante — Simples Nacional na maioria. É prestação de serviço ou comércio?', 6 * D - 3 * H),
    m('m3', 'c_joana', 'u_demo', 'Prestação de serviço, dois sócios, faturamento estimado de uns 40 mil por mês. Eles querem começar já em outubro.', 5 * D),
    m('m4', 'c_joana', 'u_joana', 'Dá tranquilo. Nesse porte costuma sair em 10 a 15 dias úteis, contando a Junta e o alvará. O alvará é o que costuma atrasar, depende da atividade e do endereço.', 5 * D - 2 * H),
    m('m5', 'c_joana', 'u_demo', 'O endereço é em sala comercial no Setor Bueno. Quanto ficaria a abertura e depois a mensalidade?', 4 * D),
    m('m6', 'c_joana', 'u_joana', 'Abertura R$ 1.200, e mensal R$ 690 com folha de até 3 funcionários. Se passar disso a gente reajusta. Sem taxa de adesão.', 4 * D - 5 * H),
    m('m7', 'c_joana', 'u_demo', 'Qual foi o trabalho mais difícil que você entregou este ano?', 3 * D, 'ritual', 2),
    m('m8', 'c_joana', 'u_joana', 'Uma regularização de empresa que ficou três anos sem declarar nada. Tive que refazer tudo para trás e negociar parcelamento. Levou cinco meses e eu aprendi a cobrar certo por esse tipo de serviço.', 3 * D - 4 * H),
    m('m9', 'c_joana', 'u_demo', 'Essa é justamente a que separa quem sabe de quem só faz o fácil. Eles vão querer saber quem assina o balanço.', 2 * D),
    m('m10', 'c_joana', 'u_joana', 'Assino eu, CRC ativo, posso mandar o número. Prefiro que confiram mesmo.', 2 * D - 6 * H),
    m('m11', 'c_joana', 'u_demo', 'Vou passar para eles hoje. Uma última: você consegue atender por vídeo? Um dos sócios mora em Rio Verde.', 20 * H),
    m('m12', 'c_joana', 'u_joana', 'Consigo, faço isso toda semana. Assinatura eu resolvo com certificado digital, ninguém precisa viajar.', 14 * H),
    m('m13', 'c_joana', 'u_demo', 'Perfeito. Acho que fechamos. Te mando os documentos amanhã de manhã.', 11 * H),
    m('m14', 'c_joana', 'u_joana', 'Combinado. Deixo a pasta preparada e te mando a lista do que preciso de cada sócio.', 3 * H),

    m('r1', 'c_paulo', 'u_demo', 'Oi, Paulo. Preciso de um laudo estrutural em Anápolis, prédio de 2004. Você faz esse tipo?', 14 * D),
    m('r2', 'c_paulo', 'u_paulo', 'Faço. Laudo de estabilidade com ART. Preciso visitar, não dá para fazer só por foto.', 13 * D),
    m('r3', 'c_paulo', 'u_demo', 'Claro. Quanto costuma ficar, e em quanto tempo sai?', 12 * D),
    m('r4', 'c_paulo', 'u_paulo', 'Depende do tamanho. Me manda a metragem e quantos pavimentos que eu te falo certo.', 11 * D),
    m('r5', 'c_paulo', 'u_demo', 'Vou levantar isso com o cliente e te retorno.', 8 * D),
  ];

  const suspeita = 'Bom dia! Para liberar seu orçamento preciso de um Pix de R$ 200 de taxa de cadastro, depois devolvo';
  const moderationQueue: ModerationItem[] = [
    {
      id: 'mod1', messageId: 'x_ext_1', connectionId: 'c_externa', authorId: 'u_daniely',
      excerpt: suspeita, result: moderateText(suspeita), status: 'pendente', createdAt: ago(5 * H),
    },
  ];

  const reports: Report[] = [
    {
      id: 'rep1', reporterId: 'u_celia', reportedId: 'u_daniely', reason: 'golpe',
      description: 'Pediu taxa antecipada para "liberar orçamento".', status: 'aberta',
      evidenceMessageIds: [], createdAt: ago(5 * H),
    },
    {
      id: 'rep2', reporterId: 'u_marcos', reportedId: 'u_celia', reason: 'spam',
      description: 'Mandou divulgação de curso em todas as conversas.', status: 'em_analise',
      evidenceMessageIds: [], createdAt: ago(2 * D),
    },
  ];

  const notifications: AppNotification[] = [
    { id: 'n1', userId: 'u_demo', kind: 'mensagem', title: 'Joana enviou uma mensagem', body: '"Deixo a pasta preparada e te mando a lista do que preciso de cada sócio."', link: { name: 'chat', id: 'c_joana' }, read: false, createdAt: ago(3 * H) },
    { id: 'n2', userId: 'u_demo', kind: 'solicitacao', title: 'Renata quer falar com você', body: 'Você tem uma solicitação esperando resposta.', link: { name: 'connections' }, read: false, createdAt: ago(20 * H) },
    { id: 'n3', userId: 'u_demo', kind: 'sistema', title: 'Seu anúncio recebeu uma proposta', body: 'Alguém se ofereceu para o trabalho que você publicou.', link: { name: 'meusAnuncios' }, read: true, createdAt: ago(9 * H) },
  ];

  return { connections, messages, moderationQueue, reports, notifications };
}
