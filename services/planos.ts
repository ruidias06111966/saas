import { PLANOS_DEMO } from '../data/seed';
import { requireSupabase, supabaseEnabled } from './supabaseClient';

// ---------------------------------------------------------------------------
// Os planos, e o preço deles.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// O preço morava em dois lugares que ninguém obrigava a concordar: 'R$ 39,90'
// em constants.ts, que é o que a pessoa LIA, e 2990 na Edge Function `assinar`,
// que é o que o cartão PAGARIA. Um virou 39,90 no PR #20; o outro nasceu 2990
// no PR #5 e ficou. Havia um teste guardando os Termos contra a tela — o
// documento ficou protegido, a caixa registadora não.
//
// A correção não foi acertar os dois números. Foi não haver dois. O preço vive
// na tabela `planos`, e é de lá que saem TANTO a tela QUANTO o checkout.
//
// Por isso não há constante de preço neste arquivo. Nem deve haver. O único
// número escrito à mão no cliente está em data/seed.ts, que é o modo
// demonstração — onde não existe cobrança nenhuma para divergir.
// ---------------------------------------------------------------------------

export type CodigoPlano = 'mensal' | 'anual';

export interface Plano {
  codigo: CodigoPlano;
  nome: string;
  centavos: number;
  intervalo: 'month' | 'year';
  ativo: boolean;
  ordem: number;
}

const COLUNAS = 'codigo, nome, centavos, intervalo, ativo, ordem';

/** Quanto custa, escrito como brasileiro escreve. */
export function emReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
  });
}

/** "por mês" e "por ano" — o que vai depois do preço, na tela. */
export function porPeriodo(p: Pick<Plano, 'intervalo'>): string {
  return p.intervalo === 'year' ? '/ano' : '/mês';
}

/**
 * Quanto sai por mês, no plano anual. É a conta que a pessoa faria de cabeça
 * antes de decidir, e fazer a conta por ela é o mínimo.
 */
export function equivalenteMensal(p: Plano): number | null {
  return p.intervalo === 'year' ? Math.round(p.centavos / 12) : null;
}

/**
 * Quanto se economiza por ano ao escolher o anual em vez do mensal. Devolve
 * null quando um dos dois não está à venda — não há desconto a anunciar sobre
 * um plano que ninguém pode comprar.
 */
export function economiaAnual(planos: Plano[]): number | null {
  const mes = planos.find((p) => p.codigo === 'mensal');
  const ano = planos.find((p) => p.codigo === 'anual');
  if (!mes || !ano) return null;
  const diferenca = mes.centavos * 12 - ano.centavos;
  return diferenca > 0 ? diferenca : null;
}

function paraPlano(r: Record<string, unknown>): Plano {
  return {
    codigo: r.codigo as CodigoPlano,
    nome: String(r.nome ?? ''),
    centavos: Number(r.centavos ?? 0),
    intervalo: (r.intervalo === 'year' ? 'year' : 'month'),
    ativo: r.ativo !== false,
    ordem: Number(r.ordem ?? 0),
  };
}

/**
 * Os planos que estão à venda, na ordem em que aparecem.
 *
 * A política de leitura vale para `anon` também, de propósito: "quanto custa?"
 * é pergunta de antes de criar conta.
 *
 * Devolve lista vazia quando a consulta falha. A tela trata vazio dizendo que
 * não conseguiu carregar — o que não se faz é inventar um preço de reserva,
 * porque um preço inventado na tela é exatamente o defeito que esta etapa
 * existe para matar.
 */
export async function planosAVenda(): Promise<Plano[]> {
  if (!supabaseEnabled) return PLANOS_DEMO.map(paraPlano);
  const { data, error } = await requireSupabase()
    .from('planos').select(COLUNAS).eq('ativo', true).order('ordem');
  if (error || !Array.isArray(data)) return [];
  return data.map((r) => paraPlano(r as Record<string, unknown>));
}

/** Todos, inclusive os fora de venda. Só o administrador enxerga os inativos. */
export async function todosOsPlanos(): Promise<Plano[]> {
  if (!supabaseEnabled) return PLANOS_DEMO.map(paraPlano);
  const { data, error } = await requireSupabase()
    .from('planos').select(COLUNAS).order('ordem');
  if (error || !Array.isArray(data)) return [];
  return data.map((r) => paraPlano(r as Record<string, unknown>));
}

/**
 * Muda o que o administrador pode mudar: nome, preço e se está à venda.
 *
 * Não existe função para criar nem para apagar plano, e isso é de propósito:
 * o banco não tem política de INSERT nem de DELETE nesta tabela. O código sabe
 * cobrar 'mensal' e 'anual'; um terceiro código inventado no painel viraria um
 * plano que ninguém sabe cobrar.
 *
 * Quem autoriza é o banco (`private.is_admin()`), nunca esta função.
 */
export async function salvarPlano(
  codigo: CodigoPlano,
  mudancas: { nome?: string; centavos?: number; ativo?: boolean },
): Promise<void> {
  const { error } = await requireSupabase()
    .from('planos').update(mudancas).eq('codigo', codigo);
  if (error) throw new Error(error.message);
}
