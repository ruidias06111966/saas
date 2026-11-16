// O mercado (anúncios e propostas) da demonstração pública — build `npm run build:demo`.
//
// No modo demo de sempre o quadro de anúncios ficava indisponível, porque as regras dele
// moram no banco. Para a demonstração do site, o vite.config.ts troca `services/mercado.ts`
// por este arquivo: as mesmas funções, com anúncios e propostas fictícios em memória.
// Nada sai do navegador e, ao recarregar a página, o quadro volta ao início.
//
// Tipos, rótulos e formatadores vêm do arquivo original; só as funções que falam com o
// banco são substituídas aqui.
import type { Anuncio, Categoria, FiltroBusca, Proposta, RascunhoAnuncio, StatusProposta } from '../services/mercado';
import { POR_PAGINA } from '../services/mercado';
import { SEED_USERS } from '../data/seed';

export * from '../services/mercado';

const DIA = 86_400_000;
const atraso = () => new Promise((r) => setTimeout(r, 150));
const haDias = (d: number, h = 10) => new Date(Date.now() - d * DIA - h * 3_600_000).toISOString();
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let seq = 100;
const novoId = (p: string) => `${p}_${++seq}`;

// As mesmas categorias da migração 008.
const CATEGORIAS: Categoria[] = [
  ['contabilidade', 'Contabilidade', 'Contábil e Tributário'],
  ['abertura-empresa', 'Abertura e alteração de empresa', 'Contábil e Tributário'],
  ['tributario', 'Planejamento tributário', 'Contábil e Tributário'],
  ['folha-pagamento', 'Folha de pagamento', 'Contábil e Tributário'],
  ['imposto-renda', 'Imposto de renda', 'Contábil e Tributário'],
  ['direito-trabalhista', 'Direito trabalhista', 'Jurídico'],
  ['direito-empresarial', 'Direito empresarial', 'Jurídico'],
  ['direito-tributario', 'Direito tributário', 'Jurídico'],
  ['contratos', 'Contratos', 'Jurídico'],
  ['licitacoes', 'Licitações e contratos públicos', 'Jurídico'],
  ['desenvolvimento-web', 'Sites e sistemas web', 'Tecnologia'],
  ['aplicativos', 'Aplicativos', 'Tecnologia'],
  ['dados', 'Dados e relatórios', 'Tecnologia'],
  ['ia-automacao', 'IA e automação', 'Tecnologia'],
  ['suporte-ti', 'Suporte e infraestrutura', 'Tecnologia'],
  ['redes-sociais', 'Redes sociais', 'Marketing e Vendas'],
  ['trafego-pago', 'Tráfego pago', 'Marketing e Vendas'],
  ['design', 'Design e identidade visual', 'Marketing e Vendas'],
  ['conteudo', 'Conteúdo e redação', 'Marketing e Vendas'],
  ['vendas', 'Vendas e prospecção', 'Marketing e Vendas'],
  ['projetos-engenharia', 'Projetos de engenharia', 'Engenharia e Obras'],
  ['laudos-tecnicos', 'Laudos e perícias', 'Engenharia e Obras'],
  ['obras-reformas', 'Obras e reformas', 'Engenharia e Obras'],
  ['eletrica-hidraulica', 'Elétrica e hidráulica', 'Engenharia e Obras'],
  ['ambiental', 'Licenciamento ambiental', 'Engenharia e Obras'],
  ['alvaras', 'Alvarás e licenciamento', 'Licenças e Segurança'],
  ['vigilancia-sanitaria', 'Vigilância sanitária', 'Licenças e Segurança'],
  ['seguranca-trabalho', 'Segurança do trabalho', 'Licenças e Segurança'],
  ['bombeiros', 'Projeto e vistoria de bombeiros', 'Licenças e Segurança'],
  ['assistente-virtual', 'Assistente virtual', 'Administrativo'],
  ['financeiro', 'Financeiro e cobrança', 'Administrativo'],
  ['rh-recrutamento', 'RH e recrutamento', 'Administrativo'],
  ['traducao', 'Tradução e revisão', 'Administrativo'],
  ['consultoria-gestao', 'Consultoria de gestão', 'Consultoria'],
  ['processos', 'Processos e qualidade', 'Consultoria'],
  ['captacao-recursos', 'Captação de recursos', 'Consultoria'],
  ['outros', 'Outros', 'Outros'],
].map(([id, nome, grupo]) => ({ id, nome, grupo }));
const nomeDaCategoria = (id: string) => CATEGORIAS.find((c) => c.id === id)?.nome;

type Linha = Omit<Anuncio, 'autorNome' | 'categoriaNome' | 'propostas'>;

function anuncio(
  id: string, autorId: string, dias: number,
  a: Pick<Linha, 'tipo' | 'titulo' | 'descricao' | 'categoriaId' | 'modalidade' | 'orcamentoTipo'> & Partial<Linha>,
): Linha {
  return {
    id, autorId, status: 'aberto', createdAt: haDias(dias), expiresAt: new Date(Date.now() + (30 - dias) * DIA).toISOString(),
    ...a,
  };
}

// O visitante entra como `u_demo` (contador, Brasília). Os outros autores são os perfis fictícios de data/seed.ts.
const anuncios: Linha[] = [
  anuncio('an_1', 'u_construtora', 1, {
    tipo: 'procurando', titulo: 'Laudo de vistoria para obra residencial', categoriaId: 'laudos-tecnicos',
    descricao: 'Casa de dois pavimentos em Aparecida de Goiânia, fase de acabamento. Precisamos de laudo de vistoria com ART para entregar ao banco do financiamento.',
    modalidade: 'presencial', cidade: 'Aparecida de Goiânia', uf: 'GO', orcamentoTipo: 'fechado', orcamentoMin: 1800, orcamentoMax: 2500, prazoDias: 10,
  }),
  anuncio('an_2', 'u_bruno', 2, {
    tipo: 'procurando', titulo: 'Contador para abrir empresa de tecnologia (Simples)', categoriaId: 'abertura-empresa',
    descricao: 'Trabalho como autônomo e quero abrir uma empresa no Simples Nacional para emitir nota para clientes de outros estados. Preciso de ajuda com CNAE, contrato social e o acompanhamento mensal.',
    modalidade: 'remoto', orcamentoTipo: 'fechado', orcamentoMin: 800, orcamentoMax: 1500, prazoDias: 30,
  }),
  anuncio('an_3', 'u_renata', 3, {
    tipo: 'oferecendo', titulo: 'Alvará sanitário para clínicas e restaurantes', categoriaId: 'vigilancia-sanitaria',
    descricao: 'Levantamento do que falta, adequação do estabelecimento e acompanhamento do processo até o alvará sair. Atendo Brasília e entorno.',
    modalidade: 'presencial', cidade: 'Brasília', uf: 'DF', orcamentoTipo: 'a_combinar',
  }),
  anuncio('an_4', 'u_marcos', 4, {
    tipo: 'procurando', titulo: 'Balanço e índices contábeis para pregão eletrônico', categoriaId: 'contabilidade',
    descricao: 'Cliente meu vai disputar pregão e o edital pede balanço do último exercício com os índices de liquidez. Preciso de contador que prepare e assine as demonstrações.',
    modalidade: 'remoto', orcamentoTipo: 'fechado', orcamentoMin: 1200, orcamentoMax: 2000, prazoDias: 7,
  }),
  anuncio('an_5', 'u_celia', 5, {
    tipo: 'oferecendo', titulo: 'Consultoria trabalhista mensal para pequenas empresas', categoriaId: 'direito-trabalhista',
    descricao: 'Para quem tem funcionário registrado: revisão de contratos, orientação em demissões e acordos, e defesa em reclamatória quando precisar.',
    modalidade: 'hibrido', cidade: 'Uberlândia', uf: 'MG', orcamentoTipo: 'fechado', orcamentoMin: 900, orcamentoMax: 900,
  }),
  anuncio('an_6', 'u_joana', 6, {
    tipo: 'oferecendo', titulo: 'Folha de pagamento e eSocial para até 20 funcionários', categoriaId: 'folha-pagamento',
    descricao: 'Folha mensal, férias, rescisões, eSocial e FGTS Digital. Escritório em Goiânia, atendo por videochamada em todo o Centro-Oeste.',
    modalidade: 'remoto', orcamentoTipo: 'fechado', orcamentoMin: 250, orcamentoMax: 600,
  }),
  anuncio('an_7', 'u_paulo', 8, {
    tipo: 'procurando', titulo: 'Advogado para revisar contrato de empreitada', categoriaId: 'contratos',
    descricao: 'Vou assinar contrato de empreitada com uma construtora e quero que um advogado revise as cláusulas de multa, prazo e garantia antes.',
    modalidade: 'remoto', orcamentoTipo: 'fechado', orcamentoMin: 400, orcamentoMax: 800, prazoDias: 5,
  }),
  anuncio('an_8', 'u_daniely', 9, {
    tipo: 'oferecendo', titulo: 'Identidade visual para comércio local', categoriaId: 'design',
    descricao: 'Logo, cartão, fachada e modelos para redes sociais. Pacote pensado para loja de bairro, com entrega em até duas semanas.',
    modalidade: 'remoto', orcamentoTipo: 'fechado', orcamentoMin: 700, orcamentoMax: 1400,
  }),
  anuncio('an_9', 'u_construtora', 11, {
    tipo: 'procurando', titulo: 'Projeto e aprovação no Corpo de Bombeiros', categoriaId: 'bombeiros',
    descricao: 'Galpão comercial de 600 m² em Goiânia. Precisamos do projeto de prevenção e combate a incêndio e do acompanhamento até a vistoria.',
    modalidade: 'presencial', cidade: 'Goiânia', uf: 'GO', orcamentoTipo: 'a_combinar', prazoDias: 45,
  }),
  anuncio('an_10', 'u_bruno', 12, {
    tipo: 'oferecendo', titulo: 'Sistema de pedidos com emissão de nota', categoriaId: 'desenvolvimento-web',
    descricao: 'Sistema web para receber pedidos, controlar entregas e emitir nota fiscal, feito para o jeito que o seu negócio trabalha.',
    modalidade: 'remoto', orcamentoTipo: 'a_combinar',
  }),
  // do visitante
  anuncio('an_11', 'u_demo', 4, {
    tipo: 'procurando', titulo: 'Identidade visual para o escritório de contabilidade', categoriaId: 'design',
    descricao: 'Quero renovar o logo, o cartão de visita e os modelos de post do escritório. Busco alguém que já tenha feito para escritório de serviço.',
    modalidade: 'remoto', orcamentoTipo: 'fechado', orcamentoMin: 800, orcamentoMax: 1500, prazoDias: 20,
  }),
  anuncio('an_12', 'u_demo', 10, {
    tipo: 'oferecendo', titulo: 'Contabilidade para quem presta serviço a órgão público', categoriaId: 'contabilidade',
    descricao: 'Abertura, regularização e acompanhamento mensal, com atenção às exigências de quem participa de licitação: certidões, balanço e índices.',
    modalidade: 'remoto', orcamentoTipo: 'fechado', orcamentoMin: 450, orcamentoMax: 1200,
  }),
];

type LinhaProposta = Omit<Proposta, 'profissionalNome' | 'profissionalProfissao' | 'profissionalReputacao' | 'anuncio'>;
const propostas: LinhaProposta[] = [
  // recebidas pelo visitante
  { id: 'pr_1', anuncioId: 'an_11', profissionalId: 'u_daniely', valor: 1200, prazoDias: 14, status: 'enviada', createdAt: haDias(3),
    mensagem: 'Olá! Já fiz identidade de dois escritórios de contabilidade em Campo Grande. Entrego logo, cartão e 10 modelos de post em duas semanas.' },
  { id: 'pr_2', anuncioId: 'an_11', profissionalId: 'u_bruno', valor: 950, prazoDias: 20, status: 'enviada', createdAt: haDias(2),
    mensagem: 'Faço a identidade e aproveito para montar uma página simples do escritório com o mesmo visual.' },
  // enviadas pelo visitante
  { id: 'pr_3', anuncioId: 'an_4', profissionalId: 'u_demo', valor: 1500, prazoDias: 5, status: 'aceita', createdAt: haDias(3),
    mensagem: 'Preparo o balanço, a DRE e o quadro de índices no formato que o edital pede. Já fiz para várias empresas que vendem ao governo.' },
  { id: 'pr_4', anuncioId: 'an_2', profissionalId: 'u_demo', valor: 1100, prazoDias: 15, status: 'enviada', createdAt: haDias(1),
    mensagem: 'Cuido da abertura completa e do primeiro ano de acompanhamento. Atendo por videochamada.' },
  // de terceiros (só contam no quadro)
  { id: 'pr_5', anuncioId: 'an_2', profissionalId: 'u_joana', valor: 900, prazoDias: 20, status: 'enviada', createdAt: haDias(1, 4),
    mensagem: 'Abro a empresa e deixo tudo pronto para emitir nota.' },
  { id: 'pr_6', anuncioId: 'an_1', profissionalId: 'u_paulo', valor: 2200, prazoDias: 7, status: 'enviada', createdAt: haDias(0, 5),
    mensagem: 'Faço a vistoria nesta semana e emito o laudo com ART.' },
];

const crachaDe = (id: string) => SEED_USERS.find((u) => u.id === id);

function completo(a: Linha): Anuncio {
  return { ...a, categoriaNome: nomeDaCategoria(a.categoriaId) };
}

export async function listarCategorias(): Promise<Categoria[]> {
  return CATEGORIAS;
}

export async function buscarAnuncios(f: FiltroBusca = {}): Promise<{ anuncios: Anuncio[]; total: number }> {
  await atraso();
  const pagina = Math.max(0, f.pagina ?? 0);
  const agora = new Date().toISOString();
  const palavras = semAcento(f.texto?.trim() ?? '').split(/\s+/).filter(Boolean);
  const achados = anuncios
    .filter((a) => a.status === 'aberto' && a.expiresAt > agora)
    .filter((a) => !f.tipo || a.tipo === f.tipo)
    .filter((a) => !f.categoriaId || a.categoriaId === f.categoriaId)
    .filter((a) => !f.uf || a.uf === f.uf)
    .filter((a) => !f.cidade || semAcento(a.cidade ?? '').includes(semAcento(f.cidade)))
    .filter((a) => !f.modalidade || a.modalidade === f.modalidade)
    .filter((a) => {
      const texto = semAcento(`${a.titulo} ${a.descricao} ${nomeDaCategoria(a.categoriaId) ?? ''}`);
      return palavras.every((p) => texto.includes(p));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { anuncios: achados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA).map(completo), total: achados.length };
}

export async function lerAnuncio(id: string): Promise<Anuncio | null> {
  await atraso();
  const a = anuncios.find((x) => x.id === id);
  return a ? { ...completo(a), autorNome: crachaDe(a.autorId)?.name } : null;
}

function validar(r: RascunhoAnuncio) {
  if (r.titulo.trim().length < 5) throw new Error('Não foi possível publicar: o título está curto demais.');
  if (r.descricao.trim().length < 20) throw new Error('Não foi possível publicar: descreva um pouco mais o serviço.');
}
const campos = (r: RascunhoAnuncio) => ({
  tipo: r.tipo,
  titulo: r.titulo.trim(),
  descricao: r.descricao.trim(),
  categoriaId: r.categoriaId,
  modalidade: r.modalidade,
  cidade: r.modalidade === 'remoto' ? undefined : r.cidade?.trim() || undefined,
  uf: r.modalidade === 'remoto' ? undefined : r.uf || undefined,
  orcamentoTipo: r.orcamentoTipo,
  orcamentoMin: r.orcamentoTipo === 'a_combinar' ? undefined : r.orcamentoMin,
  orcamentoMax: r.orcamentoTipo === 'a_combinar' ? undefined : r.orcamentoMax,
  prazoDias: r.tipo === 'oferecendo' ? undefined : r.prazoDias,
});

export async function publicarAnuncio(autorId: string, r: RascunhoAnuncio): Promise<string> {
  await atraso();
  validar(r);
  const id = novoId('an');
  anuncios.push({
    id, autorId, status: 'aberto', createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * DIA).toISOString(), ...campos(r),
  });
  return id;
}

export async function atualizarAnuncio(id: string, r: RascunhoAnuncio): Promise<void> {
  await atraso();
  validar(r);
  const a = anuncios.find((x) => x.id === id && x.status === 'aberto');
  if (!a) throw new Error('Não foi possível salvar: o anúncio não é seu ou já foi encerrado.');
  Object.assign(a, campos(r));
}

export async function encerrarAnuncio(id: string, status: 'fechado' | 'concluido' | 'cancelado'): Promise<void> {
  await atraso();
  const a = anuncios.find((x) => x.id === id);
  if (!a) throw new Error('Não foi possível encerrar o anúncio: ele já não está sob seu controle.');
  a.status = status;
}

export async function meusAnuncios(autorId: string): Promise<Anuncio[]> {
  await atraso();
  return anuncios
    .filter((a) => a.autorId === autorId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((a) => ({ ...completo(a), propostas: propostas.filter((p) => p.anuncioId === a.id).length }));
}

export async function propostasDoAnuncio(anuncioId: string): Promise<Proposta[]> {
  await atraso();
  return propostas
    .filter((p) => p.anuncioId === anuncioId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => {
      const c = crachaDe(p.profissionalId);
      return { ...p, profissionalNome: c?.name, profissionalProfissao: c?.profession, profissionalReputacao: c?.reputation };
    });
}

export async function minhasPropostas(profissionalId: string): Promise<Proposta[]> {
  await atraso();
  return propostas
    .filter((p) => p.profissionalId === profissionalId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => {
      const a = anuncios.find((x) => x.id === p.anuncioId);
      return { ...p, anuncio: a ? { id: a.id, titulo: a.titulo, status: a.status } : undefined };
    });
}

export async function temPlanoAtivo(): Promise<boolean> {
  return true;
}

export async function possoConversarCom(_outro: string): Promise<boolean> {
  return true;
}

export async function enviarProposta(
  anuncioId: string, profissionalId: string,
  p: { mensagem: string; valor?: number; prazoDias?: number },
): Promise<void> {
  await atraso();
  const a = anuncios.find((x) => x.id === anuncioId && x.status === 'aberto');
  if (!a) throw new Error('Não foi possível enviar a proposta: o anúncio já foi encerrado.');
  if (a.autorId === profissionalId) throw new Error('Não foi possível enviar a proposta: o anúncio é seu.');
  if (propostas.some((x) => x.anuncioId === anuncioId && x.profissionalId === profissionalId))
    throw new Error('Você já enviou uma proposta neste anúncio.');
  if (p.mensagem.trim().length < 10) throw new Error('Não foi possível enviar a proposta: escreva uma mensagem.');
  propostas.push({
    id: novoId('pr'), anuncioId, profissionalId, mensagem: p.mensagem.trim(), valor: p.valor, prazoDias: p.prazoDias,
    status: 'enviada', createdAt: new Date().toISOString(),
  });
}

export async function responderProposta(id: string, status: StatusProposta): Promise<void> {
  await atraso();
  const p = propostas.find((x) => x.id === id);
  if (!p || p.status !== 'enviada') throw new Error('Não foi possível atualizar a proposta: ela já não está sob seu controle.');
  p.status = status;
}

/** Para o contato liberado (demo/backend-demo.ts): as duas pontas de uma proposta aceita. */
export function partesDaPropostaAceita(propostaId: string): { autorId: string; profissionalId: string } | null {
  const p = propostas.find((x) => x.id === propostaId && x.status === 'aceita');
  const a = p && anuncios.find((x) => x.id === p.anuncioId);
  return p && a ? { autorId: a.autorId, profissionalId: p.profissionalId } : null;
}
