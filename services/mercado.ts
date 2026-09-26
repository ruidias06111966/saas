import { requireSupabase } from './supabaseClient';

// ---------------------------------------------------------------------------
// O mercado: anúncios e propostas.
//
// POR QUE ESTE ARQUIVO NÃO SEGUE O PADRÃO DO RESTO DO APP
//
// `services/backend.ts` carrega TUDO num retrato só, no arranque, e as telas
// leem daquele estado em memória. Isso funciona quando o conjunto é pequeno e
// pessoal: as suas conexões, as suas mensagens, o seu perfil.
//
// Um quadro de anúncios é o contrário. É grande, é de todo mundo, muda o dia
// inteiro e a pessoa chega nele procurando — filtrando por categoria, cidade e
// palavra. Carregar tudo no arranque seria baixar o mercado inteiro para
// mostrar dez linhas, e ficaria velho no minuto seguinte.
//
// Então aqui é busca sob demanda, com paginação, e cada tela guarda o próprio
// resultado. É uma diferença deliberada, não um descuido.
// ---------------------------------------------------------------------------

export type Modalidade = 'remoto' | 'presencial' | 'hibrido';
export type TipoOrcamento = 'fechado' | 'por_hora' | 'a_combinar';
export type StatusAnuncio = 'rascunho' | 'aberto' | 'fechado' | 'concluido' | 'cancelado';
export type StatusProposta = 'enviada' | 'aceita' | 'recusada' | 'retirada';

export interface Categoria {
  id: string;
  nome: string;
  grupo: string;
}

export interface Anuncio {
  id: string;
  autorId: string;
  autorNome?: string;
  titulo: string;
  descricao: string;
  categoriaId: string;
  categoriaNome?: string;
  modalidade: Modalidade;
  cidade?: string;
  uf?: string;
  orcamentoTipo: TipoOrcamento;
  orcamentoMin?: number;
  orcamentoMax?: number;
  prazoDias?: number;
  status: StatusAnuncio;
  createdAt: string;
  expiresAt: string;
  /** Quantas propostas chegaram. Só o dono do anúncio recebe este número. */
  propostas?: number;
}

export interface Proposta {
  id: string;
  anuncioId: string;
  profissionalId: string;
  profissionalNome?: string;
  profissionalProfissao?: string;
  profissionalReputacao?: number;
  mensagem: string;
  valor?: number;
  prazoDias?: number;
  status: StatusProposta;
  createdAt: string;
  /** Preenchido nas telas em que a proposta é mostrada fora do anúncio. */
  anuncio?: Pick<Anuncio, 'id' | 'titulo' | 'status'>;
}

export interface FiltroBusca {
  texto?: string;
  categoriaId?: string;
  uf?: string;
  cidade?: string;
  modalidade?: Modalidade;
  pagina?: number;
}

/** Quantos anúncios por página. Alto o bastante para rolar, baixo para caber. */
export const POR_PAGINA = 20;

// Sem `users` aqui de propósito. A migração 002 fechou `public.users` a
// terceiros: um embed daquela tabela voltaria com nome nulo para todo mundo
// menos administração — e administração é justamente quem testaria e não veria
// defeito nenhum. Os nomes vêm de `perfis_do_mercado`, em `nomesDe()`.
const COLUNAS_ANUNCIO = `
  id, autor_id, titulo, descricao, categoria_id, modalidade, cidade, uf,
  orcamento_tipo, orcamento_min, orcamento_max, prazo_dias, status,
  created_at, expires_at,
  categoria:categorias ( nome )
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
function paraAnuncio(r: any): Anuncio {
  return {
    id: r.id,
    autorId: r.autor_id,
    titulo: r.titulo,
    descricao: r.descricao,
    categoriaId: r.categoria_id,
    categoriaNome: r.categoria?.nome ?? undefined,
    modalidade: r.modalidade,
    cidade: r.cidade ?? undefined,
    uf: r.uf ?? undefined,
    orcamentoTipo: r.orcamento_tipo,
    orcamentoMin: r.orcamento_min == null ? undefined : Number(r.orcamento_min),
    orcamentoMax: r.orcamento_max == null ? undefined : Number(r.orcamento_max),
    prazoDias: r.prazo_dias ?? undefined,
    status: r.status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
}

function paraProposta(r: any): Proposta {
  return {
    id: r.id,
    anuncioId: r.anuncio_id,
    profissionalId: r.profissional_id,
    mensagem: r.mensagem,
    valor: r.valor == null ? undefined : Number(r.valor),
    prazoDias: r.prazo_dias ?? undefined,
    status: r.status,
    createdAt: r.created_at,
    anuncio: r.anuncio
      ? { id: r.anuncio.id, titulo: r.anuncio.titulo, status: r.anuncio.status }
      : undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** O crachá de alguém: o que aparece ao lado de um anúncio ou de uma proposta. */
export interface Cracha {
  nome: string;
  profissao?: string;
  verificado?: boolean;
  reputacao?: number;
}

/**
 * Os nomes de um punhado de pessoas, de uma vez.
 *
 * Vem da view `perfis_do_mercado` (migração 009), que é o único caminho do
 * navegador até o nome de outra pessoa — `public.users` está fechado desde a
 * 002. A view não devolve quem bloqueou você nem quem você bloqueou, então um
 * `id` pode simplesmente não voltar: quem chama trata a ausência.
 */
export async function nomesDe(ids: string[]): Promise<Map<string, Cracha>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return new Map();

  const { data, error } = await requireSupabase()
    .from('perfis_do_mercado')
    .select('id, name, profession, verified, reputation')
    .in('id', unicos);
  // Um nome que falta degrada a tela, não a derruba: o anúncio continua lá,
  // só sem o autor. Por isso isto não levanta exceção.
  if (error) return new Map();

  return new Map((data ?? []).map((r) => [r.id as string, {
    nome: r.name as string,
    profissao: (r.profession as string) || undefined,
    verificado: (r.verified as boolean) || undefined,
    reputacao: r.reputation == null ? undefined : Number(r.reputation),
  }]));
}

// ------------------------------- categorias --------------------------------

export async function listarCategorias(): Promise<Categoria[]> {
  const { data, error } = await requireSupabase()
    .from('categorias').select('id, nome, grupo').eq('ativa', true).order('ordem');
  if (error) throw new Error(`Não foi possível carregar as categorias: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo }));
}

// --------------------------------- busca -----------------------------------

/**
 * Busca no quadro de anúncios.
 *
 * O texto vai para a MESMA configuração de busca que gerou a coluna no banco
 * (`portugues_sem_acento`). Usar outra aqui traria de volta, pela ponta da
 * consulta, o problema que a migração resolveu na ponta do dado: quem escreve
 * "construcao" tem de encontrar "construção".
 */
export async function buscarAnuncios(
  f: FiltroBusca = {},
): Promise<{ anuncios: Anuncio[]; total: number }> {
  const pagina = Math.max(0, f.pagina ?? 0);
  let q = requireSupabase()
    .from('anuncios')
    .select(COLUNAS_ANUNCIO, { count: 'exact' })
    .eq('status', 'aberto')
    .gt('expires_at', new Date().toISOString());

  const texto = f.texto?.trim();
  if (texto) {
    q = q.textSearch('busca', texto, {
      type: 'plain',
      config: 'public.portugues_sem_acento',
    });
  }
  if (f.categoriaId) q = q.eq('categoria_id', f.categoriaId);
  if (f.uf) q = q.eq('uf', f.uf);
  if (f.cidade) q = q.ilike('cidade', `%${f.cidade}%`);
  if (f.modalidade) q = q.eq('modalidade', f.modalidade);

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);

  if (error) throw new Error(`Não foi possível buscar os anúncios: ${error.message}`);
  return { anuncios: (data ?? []).map(paraAnuncio), total: count ?? 0 };
}

export async function lerAnuncio(id: string): Promise<Anuncio | null> {
  const { data, error } = await requireSupabase()
    .from('anuncios').select(COLUNAS_ANUNCIO).eq('id', id).maybeSingle();
  if (error) throw new Error(`Não foi possível abrir o anúncio: ${error.message}`);
  if (!data) return null;

  const a = paraAnuncio(data);
  const crachas = await nomesDe([a.autorId]);
  return { ...a, autorNome: crachas.get(a.autorId)?.nome };
}

// ------------------------------ publicar -----------------------------------

export interface RascunhoAnuncio {
  titulo: string;
  descricao: string;
  categoriaId: string;
  modalidade: Modalidade;
  cidade?: string;
  uf?: string;
  orcamentoTipo: TipoOrcamento;
  orcamentoMin?: number;
  orcamentoMax?: number;
  prazoDias?: number;
}

export async function publicarAnuncio(autorId: string, r: RascunhoAnuncio): Promise<string> {
  const { data, error } = await requireSupabase()
    .from('anuncios')
    .insert({
      autor_id: autorId,
      titulo: r.titulo.trim(),
      descricao: r.descricao.trim(),
      categoria_id: r.categoriaId,
      modalidade: r.modalidade,
      // Anúncio remoto não carrega lugar: pedir local a quem não precisa dele
      // é atrito, e local de mentira é pior do que local nenhum.
      cidade: r.modalidade === 'remoto' ? null : (r.cidade?.trim() || null),
      uf: r.modalidade === 'remoto' ? null : (r.uf || null),
      orcamento_tipo: r.orcamentoTipo,
      orcamento_min: r.orcamentoTipo === 'a_combinar' ? null : (r.orcamentoMin ?? null),
      orcamento_max: r.orcamentoTipo === 'a_combinar' ? null : (r.orcamentoMax ?? null),
      prazo_dias: r.prazoDias ?? null,
    })
    .select('id').single();
  if (error) throw new Error(`Não foi possível publicar: ${error.message}`);
  return data.id;
}

/**
 * Encerrar um anúncio.
 *
 * O `.select('id')` no fim não é decoração. Quando a RLS recusa um UPDATE ela
 * não levanta erro: devolve zero linhas, em silêncio. Sem esta verificação o
 * app mostraria "anúncio encerrado" para quem não encerrou nada.
 */
export async function encerrarAnuncio(id: string, status: 'fechado' | 'concluido' | 'cancelado'): Promise<void> {
  const { data, error } = await requireSupabase()
    .from('anuncios').update({ status }).eq('id', id).select('id');
  if (error) throw new Error(`Não foi possível encerrar o anúncio: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error('Não foi possível encerrar o anúncio: ele já não está sob seu controle.');
  }
}

export async function meusAnuncios(autorId: string): Promise<Anuncio[]> {
  const db = requireSupabase();
  const { data, error } = await db
    .from('anuncios').select(COLUNAS_ANUNCIO)
    .eq('autor_id', autorId).order('created_at', { ascending: false });
  if (error) throw new Error(`Não foi possível carregar seus anúncios: ${error.message}`);

  const anuncios = (data ?? []).map(paraAnuncio);
  if (anuncios.length === 0) return anuncios;

  // Quantas propostas cada um recebeu. Vem em consulta separada porque a RLS
  // já garante que só o dono enxerga estas linhas — contar aqui não vaza nada.
  const { data: props } = await db
    .from('propostas').select('anuncio_id')
    .in('anuncio_id', anuncios.map((a) => a.id));
  const contagem = new Map<string, number>();
  for (const p of props ?? []) contagem.set(p.anuncio_id, (contagem.get(p.anuncio_id) ?? 0) + 1);
  return anuncios.map((a) => ({ ...a, propostas: contagem.get(a.id) ?? 0 }));
}

// ------------------------------- propostas ---------------------------------

export async function propostasDoAnuncio(anuncioId: string): Promise<Proposta[]> {
  const { data, error } = await requireSupabase()
    .from('propostas')
    .select('id, anuncio_id, profissional_id, mensagem, valor, prazo_dias, status, created_at')
    .eq('anuncio_id', anuncioId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Não foi possível carregar as propostas: ${error.message}`);

  const propostas = (data ?? []).map(paraProposta);
  if (propostas.length === 0) return propostas;

  // Sem o nome, receber dez propostas é receber dez bilhetes anônimos.
  const crachas = await nomesDe(propostas.map((p) => p.profissionalId));
  return propostas.map((p) => {
    const c = crachas.get(p.profissionalId);
    return { ...p, profissionalNome: c?.nome, profissionalProfissao: c?.profissao, profissionalReputacao: c?.reputacao };
  });
}

export async function minhasPropostas(profissionalId: string): Promise<Proposta[]> {
  const { data, error } = await requireSupabase()
    .from('propostas')
    .select('id, anuncio_id, profissional_id, mensagem, valor, prazo_dias, status, created_at, anuncio:anuncios ( id, titulo, status )')
    .eq('profissional_id', profissionalId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Não foi possível carregar suas propostas: ${error.message}`);
  return (data ?? []).map(paraProposta);
}

/**
 * Quantas propostas ainda cabem no mês.
 *
 * Vem do banco, e não de uma conta no cliente, por dois motivos: contar aqui
 * exigiria ler as propostas de terceiros (a RLS não deixa, e ainda bem), e o
 * número que vale é o mesmo que o gatilho usa para recusar. Uma conta só, num
 * lugar só. Ver 016_a_cota_de_propostas.sql.
 *
 * Devolve `Infinity` para quem é Premium — inclusive para quem está nos 60
 * dias de cortesia de lançamento.
 */
export async function propostasRestantes(): Promise<number> {
  const { data, error } = await requireSupabase().rpc('propostas_restantes');
  // Sem resposta, não bloqueia ninguém: quem recusa de verdade é o gatilho.
  if (error || typeof data !== 'number') return Infinity;
  return data > 1_000_000 ? Infinity : data;
}

export async function enviarProposta(
  anuncioId: string, profissionalId: string,
  p: { mensagem: string; valor?: number; prazoDias?: number },
): Promise<void> {
  const { error } = await requireSupabase().from('propostas').insert({
    anuncio_id: anuncioId,
    profissional_id: profissionalId,
    mensagem: p.mensagem.trim(),
    valor: p.valor ?? null,
    prazo_dias: p.prazoDias ?? null,
  });
  if (error) {
    // O banco recusa a segunda proposta pela chave única. Traduzir aqui evita
    // mostrar jargão do Postgres a quem só quis responder duas vezes.
    if (error.code === '23505') throw new Error('Você já enviou uma proposta neste anúncio.');
    // P0100 é a cota do mês, e a mensagem do gatilho já está em português e já
    // diz o que fazer. Repassar a dele é melhor do que inventar outra aqui —
    // se o limite mudar no banco, a frase muda junto.
    if (error.code === 'P0100') throw new Error(error.message);
    throw new Error(`Não foi possível enviar a proposta: ${error.message}`);
  }
}

/**
 * Responder a uma proposta.
 *
 * Quem pode fazer o quê é decidido no BANCO, pelo gatilho
 * `private.quem_muda_a_proposta`: aceitar e recusar é de quem publicou o
 * anúncio, retirar é de quem propôs. Este arquivo não repete essa regra — se
 * repetisse, haveria duas cópias dela para divergirem, e a cópia do navegador
 * é a que não vale nada.
 */
export async function responderProposta(id: string, status: StatusProposta): Promise<void> {
  const { data, error } = await requireSupabase()
    .from('propostas').update({ status }).eq('id', id).select('id');
  if (error) throw new Error(`Não foi possível atualizar a proposta: ${error.message}`);
  // Gatilho recusado levanta exceção e cai no `error` acima. RLS recusada não
  // levanta nada — devolve zero linhas. Ver encerrarAnuncio.
  if (!data || data.length === 0) {
    throw new Error('Não foi possível atualizar a proposta: ela já não está sob seu controle.');
  }
}

// -------------------------------- formatar ---------------------------------

export const dinheiro = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function faixaDeOrcamento(a: Anuncio): string {
  if (a.orcamentoTipo === 'a_combinar') return 'A combinar';
  const sufixo = a.orcamentoTipo === 'por_hora' ? '/h' : '';
  if (a.orcamentoMin != null && a.orcamentoMax != null) {
    return a.orcamentoMin === a.orcamentoMax
      ? `${dinheiro(a.orcamentoMin)}${sufixo}`
      : `${dinheiro(a.orcamentoMin)} – ${dinheiro(a.orcamentoMax)}${sufixo}`;
  }
  if (a.orcamentoMin != null) return `A partir de ${dinheiro(a.orcamentoMin)}${sufixo}`;
  if (a.orcamentoMax != null) return `Até ${dinheiro(a.orcamentoMax)}${sufixo}`;
  return 'A combinar';
}

export const MODALIDADE_LABEL: Record<Modalidade, string> = {
  remoto: 'Remoto', presencial: 'Presencial', hibrido: 'Híbrido',
};

export const STATUS_PROPOSTA_LABEL: Record<StatusProposta, string> = {
  enviada: 'Aguardando resposta', aceita: 'Aceita',
  recusada: 'Não escolhida', retirada: 'Retirada por você',
};

export function ondeFica(a: Anuncio): string {
  if (a.modalidade === 'remoto') return 'Remoto';
  return a.cidade && a.uf ? `${a.cidade}, ${a.uf}` : MODALIDADE_LABEL[a.modalidade];
}
