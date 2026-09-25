import type { User } from '../types';
import { POLICY_VERSION } from '../constants';
import { blurCoord } from '../services/utils';
import { coordenadasDe } from '../services/localizacao';

// ---------------------------------------------------------------------------
// As contas de demonstração.
//
// Servem ao modo demo (sem Supabase) e às capturas de tela. Mudaram por
// completo no pivô: antes eram doze pessoas de São Paulo procurando
// relacionamento, com bússola de personalidade e interesses; agora são
// profissionais e empresas do Centro-Oeste e de Minas, que é onde o produto
// vai tentar existir primeiro.
//
// A escolha das áreas não é decorativa. Contabilidade, licitação, alvará,
// vigilância sanitária e laudo pesam no interior de Goiás e no entorno do DF
// muito mais do que "growth" e "UX" — e um catálogo de demonstração que não
// se parece com o mercado real ensina a construir a coisa errada.
// ---------------------------------------------------------------------------

// Senha de todas as contas de demonstração: conexao123
const DEMO_HASH = '5e2ae7ceae8c9779261cb2286ef75fe09cc9e3549e787ecd0ff6dd8a3c7b9bda';

interface Spec {
  id: string;
  name: string;
  email: string;
  cidade: string;
  uf: string;
  profession: string;
  bio: string;
  /** ids de `public.categorias` — os mesmos da migração 008. */
  especialidades: string[];
  anosExperiencia?: number;
  atendeRemoto?: boolean;
  verified?: boolean;
  reputation?: number;
  plan?: User['plan'];
  role?: User['role'];
  status?: User['status'];
}

function build(s: Spec, daysAgo: number): User {
  const [lat, lng] = coordenadasDe(s.cidade, s.uf);
  const created = new Date(Date.now() - daysAgo * 86400000).toISOString();
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    passwordHash: DEMO_HASH,
    city: s.cidade,
    state: s.uf,
    approxLat: blurCoord(lat),
    approxLng: blurCoord(lng),
    extraPhotos: [],
    profession: s.profession,
    bio: s.bio,
    especialidades: s.especialidades,
    atendeRemoto: s.atendeRemoto ?? true,
    anosExperiencia: s.anosExperiencia,
    // Nenhuma conta de demonstração tem telefone. É de propósito: o telefone
    // só existe para ser revelado depois de um acordo, e dado de contato
    // inventado numa base de exemplo é exatamente o que acaba vazando para
    // uma captura de tela.
    verified: s.verified ?? false,
    reputation: s.reputation ?? 70,
    plan: s.plan ?? 'free',
    role: s.role ?? 'user',
    status: s.status ?? 'ativo',
    consents: [
      { kind: 'termos', version: POLICY_VERSION, acceptedAt: created },
      { kind: 'privacidade', version: POLICY_VERSION, acceptedAt: created },
      { kind: 'maioridade', version: POLICY_VERSION, acceptedAt: created },
    ],
    createdAt: created,
    lastActiveAt: new Date(Date.now() - Math.random() * 3 * 86400000).toISOString(),
  };
}

const SPECS: [Spec, number][] = [
  [{
    id: 'u_demo', name: 'Rui Dias', email: 'demo@qiconexao.com.br',
    cidade: 'Brasília', uf: 'DF', profession: 'Contador',
    bio: 'Contabilidade para pequenas empresas e MEI, com foco em quem presta serviço para órgão público. Abertura, regularização e o acompanhamento mensal que ninguém gosta de fazer.',
    especialidades: ['contabilidade', 'tributario', 'abertura-empresa'],
    anosExperiencia: 18, verified: true, reputation: 88, plan: 'premium',
  }, 240],
  [{
    id: 'u_admin', name: 'Administração', email: 'admin@qiconexao.com.br',
    cidade: 'Brasília', uf: 'DF', profession: 'Administração da plataforma',
    bio: 'Conta de administração.',
    especialidades: [], role: 'admin', verified: true, reputation: 100,
  }, 300],
  [{
    id: 'u_joana', name: 'Joana Marques', email: 'joana@exemplo.com.br',
    cidade: 'Goiânia', uf: 'GO', profession: 'Contadora',
    bio: 'Escritório pequeno, atendimento direto comigo. Faço abertura de empresa, folha e a papelada de Simples Nacional. Respondo no mesmo dia.',
    especialidades: ['contabilidade', 'folha-pagamento', 'abertura-empresa'],
    anosExperiencia: 12, verified: true, reputation: 84,
  }, 90],
  [{
    id: 'u_paulo', name: 'Paulo Rezende', email: 'paulo@exemplo.com.br',
    cidade: 'Anápolis', uf: 'GO', profession: 'Engenheiro civil',
    bio: 'Laudo, ART e acompanhamento de obra em Anápolis e região. Trabalho com construtora e com quem está construindo a própria casa.',
    especialidades: ['projetos-engenharia', 'laudos-tecnicos', 'obras-reformas'],
    anosExperiencia: 20, atendeRemoto: false, reputation: 79,
  }, 70],
  [{
    id: 'u_celia', name: 'Célia Nogueira', email: 'celia@exemplo.com.br',
    cidade: 'Uberlândia', uf: 'MG', profession: 'Advogada',
    bio: 'Direito empresarial e trabalhista. Contrato, defesa em reclamatória e consultoria mensal para quem tem funcionário registrado.',
    especialidades: ['direito-trabalhista', 'direito-empresarial', 'contratos'],
    anosExperiencia: 15, verified: true, reputation: 86,
  }, 55],
  [{
    id: 'u_daniely', name: 'Daniely Souza', email: 'daniely@exemplo.com.br',
    cidade: 'Campo Grande', uf: 'MS', profession: 'Designer e social media',
    bio: 'Identidade visual e redes para comércio local. Faço o que cabe no orçamento de quem tem uma loja, não de quem tem agência.',
    especialidades: ['design', 'redes-sociais'],
    anosExperiencia: 6, reputation: 74,
  }, 40],
  [{
    id: 'u_marcos', name: 'Marcos Tavares', email: 'marcos@exemplo.com.br',
    cidade: 'Cuiabá', uf: 'MT', profession: 'Consultor de licitações',
    bio: 'Preparo empresa para vender ao governo: cadastro, documentação, proposta e recurso. Já acompanhei pregão em prefeitura, estado e federal.',
    especialidades: ['licitacoes', 'direito-empresarial'],
    anosExperiencia: 11, reputation: 81,
  }, 30],
  [{
    id: 'u_renata', name: 'Renata Alves', email: 'renata@exemplo.com.br',
    cidade: 'Brasília', uf: 'DF', profession: 'Consultora de vigilância sanitária',
    bio: 'Alvará sanitário, licenciamento e adequação de estabelecimento. Clínica, restaurante e farmácia — sei o que cada fiscal olha primeiro.',
    especialidades: ['vigilancia-sanitaria', 'alvaras', 'seguranca-trabalho'],
    anosExperiencia: 9, verified: true, reputation: 83,
  }, 25],
  [{
    id: 'u_bruno', name: 'Bruno Carvalho', email: 'bruno@exemplo.com.br',
    cidade: 'Goiânia', uf: 'GO', profession: 'Desenvolvedor de sistemas',
    bio: 'Sites, sistema de pedidos e integração com emissor de nota. Trabalho sozinho e entrego funcionando, não entrego apresentação.',
    especialidades: ['desenvolvimento-web', 'aplicativos', 'ia-automacao'],
    anosExperiencia: 8, reputation: 77,
  }, 20],
  [{
    id: 'u_construtora', name: 'Construtora Cerrado', email: 'contato@cerrado.exemplo.com.br',
    cidade: 'Aparecida de Goiânia', uf: 'GO', profession: 'Construtora',
    bio: 'Obras residenciais e pequenos comerciais na região metropolitana de Goiânia. Contratamos serviço técnico com frequência.',
    especialidades: ['obras-reformas'],
    anosExperiencia: 14, atendeRemoto: false, reputation: 72,
  }, 15],
];

export const SEED_USERS: User[] = SPECS.map(([spec, days]) => build(spec, days));

export const DEMO_USER_ID = 'u_demo';
export const DEMO_ADMIN_ID = 'u_admin';
export const DEMO_PASSWORD = 'conexao123';
