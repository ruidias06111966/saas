import type { AxisKey, Lifestyle, Personality, User } from '../types';
import { POLICY_VERSION } from '../constants';
import { blurCoord } from '../services/utils';

// Senha de todas as contas de demonstração: conexao123
const DEMO_HASH = '5e2ae7ceae8c9779261cb2286ef75fe09cc9e3549e787ecd0ff6dd8a3c7b9bda';

const CITY: Record<string, [string, number, number]> = {
  sp: ['São Paulo', -23.55, -46.63],
  campinas: ['Campinas', -22.90, -47.06],
  santoandre: ['Santo André', -23.66, -46.53],
  guarulhos: ['Guarulhos', -23.45, -46.53],
  osasco: ['Osasco', -23.53, -46.79],
  sbc: ['São Bernardo do Campo', -23.69, -46.56],
  sorocaba: ['Sorocaba', -23.50, -47.45],
  rio: ['Rio de Janeiro', -22.91, -43.17],
};

const p = (energia: number, ritmo: number, planejamento: number, afeto: number, novidade: number): Personality =>
  ({ energia, ritmo, planejamento, afeto, novidade } as Record<AxisKey, number>);

const ls = (
  bebida: Lifestyle['bebida'], fumo: Lifestyle['fumo'], exercicio: Lifestyle['exercicio'],
  filhos: Lifestyle['filhos'], animais: Lifestyle['animais'], religiosidade: Lifestyle['religiosidade'],
): Lifestyle => ({ bebida, fumo, exercicio, filhos, animais, religiosidade });

interface Spec {
  id: string; name: string; email: string; birthDate: string;
  gender: User['gender']; city: keyof typeof CITY; profession: string; bio: string;
  interests: string[]; personality: Personality; lifestyle: Lifestyle;
  chatPace: User['chatPace']; goal: User['goal'];
  answers: [string, string][];
  seeking: User['preferences']['seeking']; ageMin: number; ageMax: number; maxDistanceKm: number;
  goals: User['goal'][]; verified?: boolean; reputation?: number; plan?: User['plan'];
  role?: User['role']; status?: User['status']; minCompatibility?: number;
}

function build(s: Spec, daysAgo: number): User {
  const [city, lat, lng] = CITY[s.city];
  const created = new Date(Date.now() - daysAgo * 86400000).toISOString();
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    passwordHash: DEMO_HASH,
    birthDate: s.birthDate,
    gender: s.gender,
    city,
    state: s.city === 'rio' ? 'RJ' : 'SP',
    approxLat: blurCoord(lat),
    approxLng: blurCoord(lng),
    extraPhotos: [],
    profession: s.profession,
    bio: s.bio,
    interests: s.interests,
    personality: s.personality,
    lifestyle: s.lifestyle,
    chatPace: s.chatPace,
    goal: s.goal,
    answers: s.answers.map(([promptId, answer]) => ({ promptId, answer })),
    preferences: {
      seeking: s.seeking,
      ageMin: s.ageMin,
      ageMax: s.ageMax,
      maxDistanceKm: s.maxDistanceKm,
      goals: s.goals,
      minCompatibility: s.minCompatibility ?? 0,
    },
    verified: s.verified ?? true,
    reputation: s.reputation ?? 70,
    plan: s.plan ?? 'free',
    role: s.role ?? 'user',
    status: s.status ?? 'ativo',
    consents: (['termos', 'privacidade', 'diretrizes', 'maioridade'] as const).map((kind) => ({
      kind, version: POLICY_VERSION, acceptedAt: created,
    })),
    createdAt: created,
    lastActiveAt: new Date(Date.now() - Math.round(Math.random() * 6) * 3600000).toISOString(),
  };
}

const SPECS: [Spec, number][] = [
  [{
    id: 'u_demo', name: 'João Ribeiro', email: 'joao@conexao.app', birthDate: '1993-04-18',
    gender: 'homem', city: 'sp', profession: 'Analista de dados',
    bio: 'Cozinho melhor do que aparento e converso melhor do que escrevo. Domingo é dia de feira, café longo e nenhum compromisso antes das onze.',
    interests: ['cozinhar', 'musica', 'viagens', 'cafe', 'livros', 'cinema', 'trilhas', 'animais'],
    personality: p(42, 55, 60, 65, 70), lifestyle: ls('socialmente', 'nao', 'as_vezes', 'quero', 'amo', 'pouco'),
    chatPace: 'equilibrado', goal: 'serio',
    answers: [
      ['encontro_ideal', 'Um mercado municipal de manhã, provando coisa que eu não sei pronunciar, e depois andar sem destino até cansar.'],
      ['adoro_fazer', 'Testar receita nova no sábado à tarde com um disco tocando alto. Às vezes dá errado e vira pizza.'],
      ['relacionamento_significa', 'Ter alguém com quem o silêncio não é constrangedor e a discordância não é ameaça.'],
      ['valorizo', 'Curiosidade. Quem faz pergunta de verdade e espera a resposta inteira.'],
    ],
    seeking: ['mulher'], ageMin: 26, ageMax: 40, maxDistanceKm: 60, goals: ['serio', 'conhecer', 'descobrindo'],
    plan: 'free', reputation: 78,
  }, 120],

  [{
    id: 'u_mariana', name: 'Mariana Costa', email: 'mariana@conexao.app', birthDate: '1995-09-02',
    gender: 'mulher', city: 'sp', profession: 'Arquiteta',
    bio: 'Desenho prédios de dia e cadernos de viagem de noite. Tenho uma lista de lugares que quero conhecer e uma cachorra que atende por Nina.',
    interests: ['viagens', 'musica', 'gastronomia', 'animais', 'fotografia', 'cafe', 'museus', 'cozinhar'],
    personality: p(58, 62, 68, 72, 80), lifestyle: ls('socialmente', 'nao', 'as_vezes', 'quero', 'amo', 'pouco'),
    chatPace: 'equilibrado', goal: 'serio',
    answers: [
      ['encontro_ideal', 'Exposição no meio da tarde, discussão honesta sobre o que a gente não entendeu, e comida boa depois.'],
      ['lugar_conhecer', 'Porto. Quero ver se a cidade é tão boa quanto todo mundo insiste em dizer.'],
      ['me_ganha', 'Se você lembrar de um detalhe pequeno que eu contei três semanas atrás.'],
      ['relacionamento_significa', 'Construir uma rotina que nenhum dos dois quer fugir.'],
    ],
    seeking: ['homem'], ageMin: 28, ageMax: 42, maxDistanceKm: 50, goals: ['serio', 'descobrindo'],
    reputation: 88, plan: 'premium',
  }, 90],

  [{
    id: 'u_beatriz', name: 'Beatriz Nogueira', email: 'beatriz@conexao.app', birthDate: '1991-01-27',
    gender: 'mulher', city: 'santoandre', profession: 'Professora de história',
    bio: 'Falo demais sobre coisas que aconteceram há 200 anos. Prometo que é mais interessante do que parece.',
    interests: ['historia', 'livros', 'cinema', 'cafe', 'museus', 'vinho', 'teatro', 'podcasts'],
    personality: p(35, 40, 75, 60, 45), lifestyle: ls('socialmente', 'nao', 'raro', 'tenho_nao_quero', 'gosto', 'pouco'),
    chatPace: 'poucas_profundas', goal: 'serio',
    answers: [
      ['adoro_fazer', 'Ler em pé na livraria por uma hora e sair com o livro que eu não fui buscar.'],
      ['opiniao_impopular', 'Filme longo não é defeito. Pressa é.'],
      ['nao_negociavel', 'Respeito com quem está trabalhando: garçom, motorista, porteiro.'],
      ['valorizo', 'Gente que admite quando não sabe.'],
    ],
    seeking: ['homem'], ageMin: 30, ageMax: 45, maxDistanceKm: 40, goals: ['serio'],
    reputation: 82,
  }, 200],

  [{
    id: 'u_carla', name: 'Carla Meireles', email: 'carla@conexao.app', birthDate: '1997-06-11',
    gender: 'mulher', city: 'osasco', profession: 'Designer de produto',
    bio: 'Corro de manhã, desenho de tarde e durmo cedo sem culpa nenhuma. Procuro alguém pra dividir trilha e silêncio.',
    interests: ['corrida', 'trilhas', 'desenho', 'plantas', 'podcasts', 'cafe', 'yoga', 'fotografia'],
    personality: p(30, 70, 80, 45, 65), lifestyle: ls('nunca', 'nao', 'frequente', 'indeciso', 'gosto', 'nada'),
    chatPace: 'poucas_profundas', goal: 'conhecer',
    answers: [
      ['domingo', 'Trilha antes das seis, padaria depois, e nada marcado até segunda.'],
      ['aprendendo', 'Aprendendo a não responder tudo na hora. Está difícil.'],
      ['me_faz_rir', 'Piada ruim contada com convicção total.'],
    ],
    seeking: ['homem', 'mulher'], ageMin: 25, ageMax: 38, maxDistanceKm: 40, goals: ['conhecer', 'descobrindo', 'serio'],
    reputation: 74,
  }, 45],

  [{
    id: 'u_luiza', name: 'Luíza Amaral', email: 'luiza@conexao.app', birthDate: '1989-11-30',
    gender: 'mulher', city: 'campinas', profession: 'Veterinária',
    bio: 'Dois gatos, um cachorro e zero paciência para conversa que morre no segundo dia.',
    interests: ['animais', 'plantas', 'cozinhar', 'series', 'musica', 'boardgames', 'viagens'],
    personality: p(50, 48, 55, 78, 55), lifestyle: ls('socialmente', 'nao', 'as_vezes', 'tenho_e_quero', 'amo', 'importante'),
    chatPace: 'muitas_rapidas', goal: 'serio',
    answers: [
      ['relacionamento_significa', 'Parceria de verdade, inclusive nas partes chatas: conta, médico, mudança.'],
      ['orgulho', 'Montei uma clínica do zero em quatro anos.'],
      ['me_ganha', 'Se você gostar dos meus bichos sem fazer força.'],
    ],
    seeking: ['homem'], ageMin: 30, ageMax: 46, maxDistanceKm: 120, goals: ['serio'],
    reputation: 91, plan: 'premium',
  }, 300],

  [{
    id: 'u_renata', name: 'Renata Vasques', email: 'renata@conexao.app', birthDate: '1994-03-09',
    gender: 'mulher', city: 'sp', profession: 'Jornalista',
    bio: 'Vivo de perguntar coisa para desconhecido. Aqui prometo perguntar menos e escutar mais.',
    interests: ['escrita', 'podcasts', 'cinema', 'vinho', 'viagens', 'teatro', 'filosofia', 'gastronomia'],
    personality: p(72, 75, 40, 70, 85), lifestyle: ls('socialmente', 'as_vezes', 'as_vezes', 'nao_quero', 'gosto', 'nada'),
    chatPace: 'muitas_rapidas', goal: 'conhecer',
    answers: [
      ['encontro_ideal', 'Bar sem música alta, duas cadeiras, conversa que atravessa a última rodada.'],
      ['opiniao_impopular', 'Jantar em casa é melhor que restaurante em 90% dos casos.'],
      ['daqui_cinco_anos', 'Quero estar escrevendo coisa mais longa e morando mais perto do mar.'],
    ],
    seeking: ['homem', 'nao_binario'], ageMin: 27, ageMax: 40, maxDistanceKm: 30, goals: ['conhecer', 'descobrindo'],
    reputation: 69,
  }, 30],

  [{
    id: 'u_patricia', name: 'Patrícia Lemos', email: 'patricia@conexao.app', birthDate: '1987-08-21',
    gender: 'mulher', city: 'sbc', profession: 'Enfermeira',
    bio: 'Trabalho em escala, então sumo às vezes — mas aviso antes. Gosto de gente calma e de sábado sem plano.',
    interests: ['series', 'cozinhar', 'animais', 'danca', 'musica', 'praia', 'samba'],
    personality: p(55, 45, 50, 82, 40), lifestyle: ls('socialmente', 'nao', 'raro', 'tenho_nao_quero', 'amo', 'importante'),
    chatPace: 'equilibrado', goal: 'serio',
    answers: [
      ['valorizo', 'Constância. Quem aparece nos dias comuns.'],
      ['domingo', 'Almoço demorado, cochilo sem culpa, série ruim de propósito.'],
    ],
    seeking: ['homem'], ageMin: 32, ageMax: 48, maxDistanceKm: 45, goals: ['serio', 'conhecer'],
    reputation: 85,
  }, 160],

  [{
    id: 'u_sofia', name: 'Sofia Kirsch', email: 'sofia@conexao.app', birthDate: '1998-12-05',
    gender: 'mulher', city: 'sp', profession: 'Estudante de mestrado',
    bio: 'Astronomia, café passado na hora e a mania de explicar coisa que ninguém perguntou.',
    interests: ['astronomia', 'ciencia', 'cafe', 'livros', 'filosofia', 'boardgames', 'idiomas', 'acampar'],
    personality: p(28, 52, 72, 40, 88), lifestyle: ls('nunca', 'nao', 'as_vezes', 'indeciso', 'gosto', 'nada'),
    chatPace: 'poucas_profundas', goal: 'descobrindo',
    answers: [
      ['adoro_fazer', 'Dirigir três horas para ver céu sem poluição luminosa.'],
      ['aprendendo', 'Alemão. Está indo mal, obrigada por perguntar.'],
      ['lugar_conhecer', 'Atacama. Pelo céu, não pelo deserto.'],
    ],
    seeking: ['homem', 'mulher', 'nao_binario'], ageMin: 24, ageMax: 36, maxDistanceKm: 35, goals: ['descobrindo', 'conhecer', 'amizade'],
    reputation: 72,
  }, 20],

  [{
    id: 'u_helena', name: 'Helena Ferraz', email: 'helena@conexao.app', birthDate: '1990-05-14',
    gender: 'mulher', city: 'guarulhos', profession: 'Chef de confeitaria',
    bio: 'Acordo às quatro e durmo às nove. Se você é da noite, a gente vai ter um problema logístico charmoso.',
    interests: ['confeitaria', 'cozinhar', 'feira', 'cafe', 'viagens', 'musica', 'mpb', 'gastronomia'],
    personality: p(62, 82, 78, 75, 60), lifestyle: ls('socialmente', 'nao', 'frequente', 'quero', 'gosto', 'pouco'),
    chatPace: 'equilibrado', goal: 'serio',
    answers: [
      ['me_ganha', 'Se você comer o que eu fiz e disser a verdade sobre ele.'],
      ['orgulho', 'Aprendi a fazer massa folhada sozinha, vendo vídeo, errando 40 vezes.'],
      ['relacionamento_significa', 'Alguém no mesmo time, não do outro lado da mesa.'],
    ],
    seeking: ['homem'], ageMin: 29, ageMax: 44, maxDistanceKm: 50, goals: ['serio'],
    reputation: 87,
  }, 75],

  [{
    id: 'u_tais', name: 'Taís Monteiro', email: 'tais@conexao.app', birthDate: '1996-02-19',
    gender: 'mulher', city: 'sp', profession: 'Fisioterapeuta',
    bio: 'Praia sempre que dá, academia quase sempre, e uma queda séria por jogo de tabuleiro complicado.',
    interests: ['praia', 'surf', 'academia', 'boardgames', 'series', 'gastronomia', 'ciclismo'],
    personality: p(68, 78, 45, 68, 72), lifestyle: ls('socialmente', 'nao', 'frequente', 'quero', 'gosto', 'nada'),
    chatPace: 'muitas_rapidas', goal: 'conhecer',
    answers: [
      ['domingo', 'Onda de manhã, açaí, e nada que exija sapato fechado.'],
      ['me_faz_rir', 'Gente competitiva demais em jogo de tabuleiro. Inclusive eu.'],
    ],
    seeking: ['homem'], ageMin: 26, ageMax: 38, maxDistanceKm: 40, goals: ['conhecer', 'serio', 'descobrindo'],
    reputation: 76,
  }, 55],

  [{
    id: 'u_isabel', name: 'Isabel Duarte', email: 'isabel@conexao.app', birthDate: '1985-07-08',
    gender: 'mulher', city: 'sp', profession: 'Advogada',
    bio: 'Direta no jeito e devagar nas decisões. Tenho uma filha de 9 anos que é a melhor parte da minha rotina.',
    interests: ['livros', 'teatro', 'vinho', 'viagens', 'yoga', 'cinema', 'voluntariado'],
    personality: p(45, 66, 88, 58, 50), lifestyle: ls('socialmente', 'nao', 'as_vezes', 'tenho_nao_quero', 'gosto', 'importante'),
    chatPace: 'poucas_profundas', goal: 'serio',
    answers: [
      ['nao_negociavel', 'Minha filha vem antes. Isso não é negociável e nem deveria precisar ser dito.'],
      ['relacionamento_significa', 'Escolher a mesma pessoa de novo, num dia comum, sem motivo especial.'],
      ['valorizo', 'Maturidade emocional. Não é a mesma coisa que idade.'],
    ],
    seeking: ['homem'], ageMin: 33, ageMax: 50, maxDistanceKm: 35, goals: ['serio'],
    reputation: 93, plan: 'premium',
  }, 240],

  [{
    id: 'u_juliana', name: 'Juliana Prado', email: 'juliana@conexao.app', birthDate: '1999-10-23',
    gender: 'mulher', city: 'sorocaba', profession: 'Ilustradora',
    bio: 'Desenho monstrinho fofo para viver. Procuro gente que ainda acha graça em coisa boba.',
    interests: ['desenho', 'jogos', 'series', 'musica', 'animais', 'cinema', 'moda'],
    personality: p(38, 58, 35, 70, 78), lifestyle: ls('nunca', 'nao', 'raro', 'indeciso', 'amo', 'nada'),
    chatPace: 'muitas_rapidas', goal: 'descobrindo',
    answers: [
      ['adoro_fazer', 'Desenhar ouvindo podcast de crime real. Combinação estranha, eu sei.'],
      ['opiniao_impopular', 'Videogame é arte, e eu morro nessa praia.'],
    ],
    seeking: ['homem', 'mulher'], ageMin: 22, ageMax: 33, maxDistanceKm: 150, goals: ['descobrindo', 'amizade', 'conhecer'],
    reputation: 65,
  }, 15],

  [{
    id: 'u_camila', name: 'Camila Rocha', email: 'camila@conexao.app', birthDate: '1992-04-02',
    gender: 'mulher', city: 'rio', profession: 'Produtora cultural',
    bio: 'Rio, mas viajo muito a trabalho. Se a conversa for boa, a distância é detalhe resolvível.',
    interests: ['musica', 'shows', 'samba', 'praia', 'teatro', 'viagens', 'gastronomia', 'danca'],
    personality: p(85, 88, 30, 85, 90), lifestyle: ls('frequente', 'as_vezes', 'as_vezes', 'nao_quero', 'gosto', 'nada'),
    chatPace: 'muitas_rapidas', goal: 'conhecer',
    answers: [
      ['encontro_ideal', 'Show pequeno, lugar em pé, e sair de lá com fome às onze da noite.'],
      ['trilha_sonora', 'Muito Djavan e um pouco de coisa que eu vou fingir que descobri antes de todo mundo.'],
    ],
    seeking: ['homem'], ageMin: 28, ageMax: 42, maxDistanceKm: 500, goals: ['conhecer', 'descobrindo'],
    reputation: 70,
  }, 65],

  [{
    id: 'u_admin', name: 'Equipe CONEXÃO', email: 'admin@conexao.app', birthDate: '1990-01-01',
    gender: 'outro', city: 'sp', profession: 'Moderação',
    bio: 'Conta administrativa. Não aparece na descoberta.',
    interests: [], personality: p(50, 50, 50, 50, 50),
    lifestyle: ls('nunca', 'nao', 'as_vezes', 'indeciso', 'gosto', 'nada'),
    chatPace: 'equilibrado', goal: 'amizade', answers: [],
    seeking: ['todos'], ageMin: 18, ageMax: 99, maxDistanceKm: 1, goals: [],
    role: 'admin', reputation: 100, verified: true,
  }, 400],
];

export const SEED_USERS: User[] = SPECS.map(([spec, days]) => build(spec, days));

export const DEMO_USER_ID = 'u_demo';
export const DEMO_ADMIN_ID = 'u_admin';
export const DEMO_PASSWORD = 'conexao123';
