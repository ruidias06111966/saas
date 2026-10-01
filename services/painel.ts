import type { AccountStatus } from '../types';
import type { StatusAnuncio, TipoAnuncio } from './mercado';
import { requireSupabase, supabaseEnabled } from './supabaseClient';

// ---------------------------------------------------------------------------
// O QUE O PAINEL ADMINISTRATIVO LÊ — e por que não lê do `state`.
//
// O DEFEITO QUE ESTE ARQUIVO EXISTE PARA MATAR
//
// Todos os números do painel saíam de `state`, isto é, da lista que o navegador
// CARREGOU para montar as telas do mercado. E essa lista não é a verdade:
//
//   • as pessoas vinham da view `perfis_do_mercado`, que exige `status =
//     'ativo'`. Conta SUSPENSA sai da lista. Por isso a métrica "Contas
//     suspensas" só sabia dizer ZERO — e o botão "Reativar" existia para uma
//     linha que nunca aparecia. Suspender por engano não tinha volta pela tela.
//
//   • as mensagens vinham paginadas (as 40 últimas de cada conversa), então
//     "Mensagens" era "mensagens recentes carregadas". Hoje há 17 numa conversa
//     só, menos que 40, e o número está certo por acaso.
//
//   • o PostgREST tem teto de linhas por resposta: passando dele, a lista corta
//     em silêncio e a contagem passa a ser o teto.
//
// O banco SEMPRE permitiu o certo: toda policy de leitura destas tabelas
// termina em `or private.is_admin()`. O painel é que nunca perguntou.
//
// Agora os números são contados no servidor, sobre todas as linhas, pela função
// `painel_do_administrador()` — que recusa quem não é administrador antes de
// contar qualquer coisa.
// ---------------------------------------------------------------------------

/** Os números do painel, já contados pelo servidor. Centavos, não reais. */
export interface NumerosDoPainel {
  pessoas: {
    total: number; ativas24h: number; novasHoje: number;
    verificadas: number; suspensas: number; apagadas: number;
  };
  mercado: {
    procuras: number; ofertas: number; abertos: number;
    comProposta: number; propostas: number; propostasAceitas: number;
  };
  conversa: { conexoes: number; conversas: number; mensagens: number; despedidas: number };
  cuidado: { denunciasAbertas: number; filaModeracao: number };
  dinheiro: {
    assinaturasAtivas: number; pagantes: number; cortesias: number;
    mensais: number; anuais: number; mrrCentavos: number; arrCentavos: number;
  };
  apuradoEm: string;
}

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

function paraNumeros(j: Record<string, Record<string, unknown> | string>): NumerosDoPainel {
  const g = (k: string) => (j[k] ?? {}) as Record<string, unknown>;
  const p = g('pessoas'), m = g('mercado'), c = g('conversa'), cu = g('cuidado'), d = g('dinheiro');
  return {
    pessoas: {
      total: n(p.total), ativas24h: n(p.ativas_24h), novasHoje: n(p.novas_hoje),
      verificadas: n(p.verificadas), suspensas: n(p.suspensas), apagadas: n(p.apagadas),
    },
    mercado: {
      procuras: n(m.procuras), ofertas: n(m.ofertas), abertos: n(m.abertos),
      comProposta: n(m.com_proposta), propostas: n(m.propostas),
      propostasAceitas: n(m.propostas_aceitas),
    },
    conversa: {
      conexoes: n(c.conexoes), conversas: n(c.conversas),
      mensagens: n(c.mensagens), despedidas: n(c.despedidas),
    },
    cuidado: { denunciasAbertas: n(cu.denuncias_abertas), filaModeracao: n(cu.fila_moderacao) },
    dinheiro: {
      assinaturasAtivas: n(d.assinaturas_ativas), pagantes: n(d.pagantes),
      cortesias: n(d.cortesias), mensais: n(d.mensais), anuais: n(d.anuais),
      mrrCentavos: n(d.mrr_centavos), arrCentavos: n(d.arr_centavos),
    },
    apuradoEm: String(j.apurado_em ?? ''),
  };
}

/**
 * Os números, contados no servidor.
 *
 * Devolve `null` quando não há servidor (modo demonstração) ou quando a leitura
 * falha. A tela trata `null` dizendo que não conseguiu apurar — o que ela NÃO
 * faz é cair de volta para a contagem em memória, porque era isso o defeito.
 */
export async function numerosDoPainel(): Promise<NumerosDoPainel | null> {
  if (!supabaseEnabled) return null;
  const { data, error } = await requireSupabase().rpc('painel_do_administrador');
  if (error || !data || typeof data !== 'object') return null;
  return paraNumeros(data as Record<string, Record<string, unknown>>);
}

// ---------------------------------------------------------------------------
// As pessoas, lidas de `users` — e não da view do mercado.
//
// É esta troca que faz a conta suspensa voltar a aparecer, e com ela o botão de
// reativar deixar de ser decoração. A policy "usuário lê o próprio registro"
// termina em `or private.is_admin()`, então o administrador já podia.
// ---------------------------------------------------------------------------
export interface PessoaDoPainel {
  id: string;
  nome: string;
  email: string;
  cidade: string;
  uf: string;
  profissao: string;
  verificada: boolean;
  reputacao: number;
  plano: 'free' | 'premium';
  status: AccountStatus;
  apagadaEm?: string;
  criadaEm: string;
}

const COLUNAS_PESSOA =
  'id, name, email, city, state, profession, verified, reputation, plan, status, deleted_at, created_at';

/**
 * As pessoas do painel, inclusive as suspensas, banidas e apagadas.
 *
 * `busca` filtra no SERVIDOR por nome, e-mail ou cidade. Filtrar no navegador
 * exigiria trazer a base inteira — que é o hábito que esta etapa desfaz.
 */
export async function pessoasDoPainel(busca = '', limite = 200): Promise<PessoaDoPainel[]> {
  if (!supabaseEnabled) return [];
  let q = requireSupabase().from('users').select(COLUNAS_PESSOA)
    .neq('role', 'admin')
    .order('created_at', { ascending: false })
    .limit(limite);

  const termo = busca.trim();
  if (termo) {
    // `or` do PostgREST: vírgula separa as alternativas, `*` é o curinga.
    const alvo = termo.replace(/[,()*]/g, ' ').trim();
    if (alvo) q = q.or(`name.ilike.*${alvo}*,email.ilike.*${alvo}*,city.ilike.*${alvo}*`);
  }

  const { data, error } = await q;
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nome: String(r.name ?? ''),
    email: String(r.email ?? ''),
    cidade: String(r.city ?? ''),
    uf: String(r.state ?? ''),
    profissao: String(r.profession ?? ''),
    verificada: r.verified === true,
    reputacao: n(r.reputation),
    plano: r.plan === 'premium' ? 'premium' : 'free',
    status: (r.status ?? 'ativo') as AccountStatus,
    apagadaEm: r.deleted_at ? String(r.deleted_at) : undefined,
    criadaEm: String(r.created_at ?? ''),
  }));
}

// ---------------------------------------------------------------------------
// Os anúncios, todos eles, com filtros.
//
// A policy de `anuncios` abre para o administrador por inteiro — inclusive
// rascunhos, fechados e vencidos, que é justamente o que não aparece em
// nenhuma outra tela.
// ---------------------------------------------------------------------------
export interface AnuncioDoPainel {
  id: string;
  titulo: string;
  tipo: TipoAnuncio;
  status: StatusAnuncio;
  cidade: string;
  uf: string;
  autorId: string;
  criadoEm: string;
  expiraEm: string;
  propostas: number;
}

export interface FiltroDoPainel {
  tipo?: TipoAnuncio | 'todos';
  status?: StatusAnuncio | 'todos';
  busca?: string;
}

/**
 * Os anúncios que casam com o filtro, e quantas propostas cada um recebeu.
 *
 * A contagem de propostas vem numa consulta embutida (`propostas(count)`), e
 * não de um laço no navegador: um laço faria uma requisição por anúncio.
 */
export async function anunciosDoPainel(f: FiltroDoPainel = {}, limite = 200): Promise<AnuncioDoPainel[]> {
  if (!supabaseEnabled) return [];
  let q = requireSupabase().from('anuncios')
    .select('id, titulo, tipo_anuncio, status, cidade, uf, autor_id, created_at, expires_at, propostas(count)')
    .order('created_at', { ascending: false })
    .limit(limite);

  if (f.tipo && f.tipo !== 'todos') q = q.eq('tipo_anuncio', f.tipo);
  if (f.status && f.status !== 'todos') q = q.eq('status', f.status);
  const termo = (f.busca ?? '').replace(/[,()*]/g, ' ').trim();
  if (termo) q = q.or(`titulo.ilike.*${termo}*,cidade.ilike.*${termo}*`);

  const { data, error } = await q;
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    titulo: String(r.titulo ?? ''),
    tipo: (r.tipo_anuncio === 'oferecendo' ? 'oferecendo' : 'procurando') as TipoAnuncio,
    status: (r.status ?? 'aberto') as StatusAnuncio,
    cidade: String(r.cidade ?? ''),
    uf: String(r.uf ?? ''),
    autorId: String(r.autor_id ?? ''),
    criadoEm: String(r.created_at ?? ''),
    expiraEm: String(r.expires_at ?? ''),
    propostas: n((Array.isArray(r.propostas) ? r.propostas[0] : undefined as unknown as { count?: number })?.count),
  }));
}
