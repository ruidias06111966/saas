import React, { useEffect, useMemo, useState } from 'react';
import type { AccountStatus, ReportStatus } from '../types';
import { APP_NAME, REPORT_REASON_LABEL } from '../constants';
import { CATEGORY_LABEL } from '../services/moderation';
import { useApp } from '../state/AppContext';
import * as backend from '../services/backend';
import {
  type AnuncioDoPainel, type FiltroDoPainel, type NumerosDoPainel, type PessoaDoPainel,
  anunciosDoPainel, numerosDoPainel, pessoasDoPainel,
} from '../services/painel';
import { type Plano, emReais, porPeriodo, salvarPlano, todosOsPlanos } from '../services/planos';
import type { StatusAnuncio, TipoAnuncio } from '../services/mercado';
import { supabaseEnabled } from '../services/supabaseClient';
import { findUser } from '../state/appState';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Chip, Empty, Icon, Input, SectionTitle, Select, Tabs } from '../components/ui';
import { Avatar } from '../components/Portrait';
import { FilaVerificacao } from '../components/FilaVerificacao';
import { dateKey, firstName, timeAgo } from '../services/utils';

type Tab = 'painel' | 'anuncios' | 'planos' | 'usuarios' | 'denuncias' | 'moderacao' | 'verificacao';

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </Card>
  );
}

export function Admin() {
  const { me, state, dispatch, back, toast } = useApp();
  const [tab, setTab] = useState<Tab>('painel');
  const [query, setQuery] = useState('');
  /** Muda de valor para as listas do servidor lerem de novo depois de uma ação. */
  const [recarga, setRecarga] = useState(0);

  /**
   * OS NÚMEROS VÊM DO SERVIDOR. Esta é a correção desta etapa.
   *
   * Antes saíam de `state` — a lista que o navegador carregou para montar as
   * telas do mercado. Essa lista exclui contas suspensas (a view exige
   * `status = 'ativo'`), traz mensagens paginadas e corta no teto do PostgREST.
   * O painel somava aquilo e apresentava como se fosse a base inteira.
   */
  const [numeros, setNumeros] = useState<NumerosDoPainel | null>(null);
  const [apurando, setApurando] = useState(supabaseEnabled);

  useEffect(() => {
    if (!supabaseEnabled) return;
    let vivo = true;
    numerosDoPainel()
      .then((r) => { if (vivo) { setNumeros(r); setApurando(false); } })
      .catch(() => { if (vivo) setApurando(false); });
    return () => { vivo = false; };
  }, []);

  /**
   * O modo demonstração não tem servidor — e ali a lista em memória É a base
   * inteira, porque ela nasce do seed. Contar dela é correto ali, e SÓ ali.
   *
   * A primeira linha é o guarda: com servidor, este caminho devolve null e a
   * tela fica sem números em vez de mostrar números da memória. Preferir buraco
   * a número errado é o ponto desta etapa.
   */
  const numerosDaDemonstracao = useMemo<NumerosDoPainel | null>(() => {
    if (supabaseEnabled) return null;
    const pessoas = state.users.filter((u) => u.role !== 'admin');
    const dia = Date.now() - 86400000;
    const hoje = dateKey();
    const conversas = new Set(state.messages.map((m) => m.connectionId)).size;
    return {
      pessoas: {
        total: pessoas.length,
        ativas24h: pessoas.filter((u) => new Date(u.lastActiveAt).getTime() > dia).length,
        novasHoje: pessoas.filter((u) => u.createdAt.slice(0, 10) === hoje).length,
        verificadas: pessoas.filter((u) => u.verified).length,
        suspensas: pessoas.filter((u) => u.status !== 'ativo').length,
        apagadas: 0,
      },
      mercado: {
        procuras: 0, ofertas: 0, abertos: 0, comProposta: 0, propostas: 0, propostasAceitas: 0,
      },
      conversa: {
        conexoes: state.connections.filter((c) => c.status === 'conectada').length,
        conversas,
        mensagens: state.messages.length,
        despedidas: state.connections.filter((c) => c.closedGently).length,
      },
      cuidado: {
        denunciasAbertas: state.reports.filter((r) => r.status === 'aberta' || r.status === 'em_analise').length,
        filaModeracao: state.moderationQueue.filter((m) => m.status === 'pendente').length,
      },
      dinheiro: {
        assinaturasAtivas: pessoas.filter((u) => u.plan === 'premium').length,
        pagantes: 0, cortesias: 0, mensais: 0, anuais: 0, mrrCentavos: 0, arrCentavos: 0,
      },
      apuradoEm: new Date().toISOString(),
    };
  }, [state]);

  const num = supabaseEnabled ? numeros : numerosDaDemonstracao;

  if (!me) return null;
  if (me.role !== 'admin') {
    return (
      <Page title="Área restrita" back={back}>
        {/* Esta tela é conveniência, não proteção. Quem protege é o RLS do
            Postgres: sem `role = 'admin'` na própria linha, o banco devolve
            zero em denúncias, moderação e fila de verificação — não importa o
            que este JavaScript faça.
            O texto não nomeia nenhuma conta de propósito: dizer qual é o
            e-mail do administrador para quem acabou de ser barrado entrega
            metade de um login. Antes daqui citava `admin@conexao.app`, que
            desde 05/09/2026 nem é mais administrador. */}
        <Banner tone="danger" icon="shield" title="Acesso negado">
          Esta área é exclusiva da equipe de moderação, e sua conta não faz parte dela.
          Se você deveria ter acesso, peça a quem administra o sistema.
        </Banner>
      </Page>
    );
  }

  /**
   * AS PESSOAS VÊM DE `users`, NÃO DA VIEW DO MERCADO.
   *
   * É esta troca que faz a conta suspensa voltar a aparecer. A view exige
   * `status = 'ativo'`, então quem era suspenso DESAPARECIA desta lista — e o
   * botão "Reativar", que só aparece para quem não está ativo, nunca podia ser
   * clicado. Suspender por engano não tinha volta pela tela.
   *
   * A busca também passou para o servidor: filtrar no navegador exigiria trazer
   * a base inteira, que é o hábito que esta etapa desfaz.
   */
  const [pessoas, setPessoas] = useState<PessoaDoPainel[]>([]);

  useEffect(() => {
    if (!supabaseEnabled || tab !== 'usuarios') return;
    let vivo = true;
    const t = window.setTimeout(() => {
      void pessoasDoPainel(query).then((r) => { if (vivo) setPessoas(r); });
    }, 250);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [query, tab, recarga]);

  /** No modo demonstração não há servidor; ali a memória é a base inteira. */
  const pessoasDaDemonstracao = useMemo<PessoaDoPainel[]>(() => {
    if (supabaseEnabled) return [];
    const termo = query.trim().toLowerCase();
    return state.users
      .filter((u) => u.role !== 'admin')
      .filter((u) => !termo || `${u.name} ${u.email} ${u.city}`.toLowerCase().includes(termo))
      .map((u) => ({
        id: u.id, nome: u.name, email: u.email ?? '', cidade: u.city, uf: u.state ?? '',
        profissao: u.profession ?? '', verificada: !!u.verified, reputacao: u.reputation ?? 0,
        plano: u.plan, status: u.status, criadaEm: u.createdAt,
      }));
  }, [state.users, query]);

  const listaDePessoas = supabaseEnabled ? pessoas : pessoasDaDemonstracao;

  /**
   * Toda decisão do painel seguia este molde: `dispatch` e um aviso verde. Só
   * que `dispatch` mexe na memória DESTE navegador — recarregar a página
   * desfazia tudo. Uma conta "suspensa" voltava sozinha.
   *
   * Agora grava no servidor e só então avisa. Se o servidor recusar, quem
   * decidiu fica sabendo, em vez de achar que resolveu.
   */
  const comServidor = async (
    acao: () => Promise<void>, aoDarCerto: () => void, sucesso: string,
  ) => {
    try {
      if (supabaseEnabled) await acao();
      aoDarCerto();
      toast(sucesso, 'ok');
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  const setStatus = (id: string, status: AccountStatus) => {
    void comServidor(
      () => backend.definirStatusDaConta(id, status),
      () => { dispatch({ type: 'UPDATE_USER', id, patch: { status } }); setRecarga((r) => r + 1); },
      `Conta marcada como ${status}.`,
    );
  };

  const decidirModeracao = (id: string, status: 'liberado' | 'removido') => {
    if (!me) return;
    void comServidor(
      () => backend.decidirModeracao(id, status, me.id),
      () => dispatch({ type: 'UPDATE_MODERATION', id, patch: { status } }),
      status === 'liberado' ? 'Mensagem liberada.' : 'Mensagem removida.',
    );
  };

  const resolveReport = (id: string, status: ReportStatus, note: string) => {
    if (!me) return;
    const resolvedAt = new Date().toISOString();
    void comServidor(
      () => backend.resolverDenuncia(id, status, note, me.id),
      () => dispatch({ type: 'UPDATE_REPORT', id, patch: { status, resolvedAt, adminNote: note } }),
      'Denúncia atualizada.',
    );
  };

  // ----- ANÚNCIOS -----
  const [filtro, setFiltro] = useState<FiltroDoPainel>({ tipo: 'todos', status: 'todos', busca: '' });
  const [anuncios, setAnuncios] = useState<AnuncioDoPainel[] | null>(null);

  useEffect(() => {
    if (!supabaseEnabled || tab !== 'anuncios') return;
    let vivo = true;
    const t = window.setTimeout(() => {
      void anunciosDoPainel(filtro).then((r) => { if (vivo) setAnuncios(r); });
    }, 250);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [filtro, tab]);

  // ----- PLANOS -----
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  /** O que está sendo digitado, em reais, por código de plano. */
  const [rascunhoPreco, setRascunhoPreco] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState('');

  useEffect(() => {
    if (!supabaseEnabled || tab !== 'planos') return;
    let vivo = true;
    void todosOsPlanos().then((r) => { if (vivo) setPlanos(r); });
    return () => { vivo = false; };
  }, [tab, recarga]);

  /**
   * Reais digitados -> centavos. Devolve null quando não dá para ler um número,
   * e a tela não deixa salvar nesse caso.
   *
   * Aceita "49,90", "49.90" e "4990" como quarenta e nove e noventa? NÃO: "4990"
   * é lido como quatro mil novecentos e noventa reais. Adivinhar a intenção de
   * quem digita preço é como se cobra o valor errado — a tela mostra de volta o
   * que entendeu, e quem decide confere antes de salvar.
   */
  const paraCentavos = (texto: string): number | null => {
    const limpo = texto.replace(/[^\d,.]/g, '').replace(/\./g, ',');
    if (!limpo) return null;
    const [inteiros, decimais = ''] = limpo.split(',');
    if (!/^\d+$/.test(inteiros)) return null;
    const centavos = Number(inteiros) * 100 + Number((decimais + '00').slice(0, 2));
    return Number.isFinite(centavos) ? centavos : null;
  };

  const guardarPlano = async (plano: Plano, mudancas: { centavos?: number; ativo?: boolean }) => {
    setSalvando(plano.codigo);
    try {
      await salvarPlano(plano.codigo, mudancas);
      setRascunhoPreco((r) => ({ ...r, [plano.codigo]: '' }));
      setRecarga((r) => r + 1);
      toast('Plano atualizado. Quem já assinou mantém o valor que contratou.', 'ok');
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setSalvando('');
    }
  };

  return (
    <Page
      title="Painel administrativo" back={back}
      subtitle="Nenhuma suspensão acontece automaticamente. Tudo o que a IA sinaliza para aqui, para decisão humana."
    >
      <Tabs<Tab>
        value={tab} onChange={setTab}
        tabs={[
          { id: 'painel', label: 'Visão geral' },
          { id: 'anuncios', label: 'Anúncios' },
          { id: 'planos', label: 'Planos' },
          { id: 'usuarios', label: 'Usuários', count: num?.pessoas.total },
          { id: 'denuncias', label: 'Denúncias', count: num?.cuidado.denunciasAbertas },
          { id: 'moderacao', label: 'Moderação', count: num?.cuidado.filaModeracao },
          { id: 'verificacao', label: 'Verificação' },
        ]}
      />

      {tab === 'painel' && (
        <div className="mt-5 space-y-6">
          {/* Sem números, a tela diz que não apurou. Não mostra os da memória:
              era exatamente isso o defeito. */}
          {apurando && <Card className="p-5"><p className="text-[14px] text-muted">Apurando no servidor…</p></Card>}
          {!apurando && !num && (
            <Banner tone="warn" icon="info" title="Não consegui apurar os números agora">
              Tente recarregar daqui a pouco. Os números desta tela são contados no servidor, sobre
              a base inteira — e é melhor ficar sem número do que mostrar um número que conta só o
              que este navegador carregou.
            </Banner>
          )}

          {num && (
            <>
              <section>
                <SectionTitle hint="Somado no servidor, sobre todas as assinaturas ativas.">
                  Dinheiro
                </SectionTitle>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Receita por mês" value={emReais(num.dinheiro.mrrCentavos)} hint="MRR" />
                  <Metric label="Receita por ano" value={emReais(num.dinheiro.arrCentavos)} hint="ARR" />
                  <Metric label="Pagantes" value={num.dinheiro.pagantes}
                          hint={`${num.dinheiro.mensais} mensal · ${num.dinheiro.anuais} anual`} />
                  <Metric label="Cortesias" value={num.dinheiro.cortesias} hint="acesso sem receita" />
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  Cada assinatura entra pelo valor que <strong>ela</strong> contratou. Mudar o preço
                  na aba <em>Planos</em> não mexe em quem já assinou — nem na cobrança, nem aqui.
                </p>
              </section>

              <section>
                <SectionTitle hint="O que o mercado está fazendo.">Mercado</SectionTitle>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Procuras" value={num.mercado.procuras} />
                  <Metric label="Ofertas" value={num.mercado.ofertas} />
                  <Metric label="Abertos agora" value={num.mercado.abertos} />
                  <Metric
                    label="Anúncios com proposta" value={num.mercado.comProposta}
                    hint={num.mercado.procuras + num.mercado.ofertas > 0
                      ? `${Math.round((num.mercado.comProposta / (num.mercado.procuras + num.mercado.ofertas)) * 100)}% do total`
                      : undefined}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Propostas enviadas" value={num.mercado.propostas} />
                  <Metric
                    label="Propostas aceitas" value={num.mercado.propostasAceitas}
                    hint={num.mercado.propostas > 0
                      ? `${Math.round((num.mercado.propostasAceitas / num.mercado.propostas) * 100)}% das enviadas`
                      : undefined}
                  />
                  <Metric label="Conversas" value={num.conversa.conversas} />
                  <Metric label="Mensagens" value={num.conversa.mensagens} />
                </div>
              </section>

              <section>
                <SectionTitle hint="Quem está no sistema.">Pessoas</SectionTitle>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Contas" value={num.pessoas.total} hint={`${num.pessoas.verificadas} verificadas`} />
                  <Metric label="Ativas em 24 h" value={num.pessoas.ativas24h} />
                  <Metric label="Novas hoje" value={num.pessoas.novasHoje} />
                  <Metric label="Suspensas ou banidas" value={num.pessoas.suspensas}
                          hint={num.pessoas.apagadas ? `${num.pessoas.apagadas} apagadas` : undefined} />
                </div>
              </section>

              <section>
                <SectionTitle hint="O que espera decisão humana.">Cuidado</SectionTitle>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Denúncias abertas" value={num.cuidado.denunciasAbertas} />
                  <Metric label="Fila de moderação" value={num.cuidado.filaModeracao} />
                  <Metric label="Conexões" value={num.conversa.conexoes} />
                  <Metric label="Encerradas com despedida" value={num.conversa.despedidas}
                          hint="métrica anti-ghosting" />
                </div>
              </section>

              <Banner tone="info" icon="chart" title="A métrica que importa aqui">
                Num site de anúncios comum, a métrica de sucesso é volume de cadastros. No {APP_NAME} é
                a <strong>proporção de anúncios que recebem pelo menos uma proposta</strong> e a de
                propostas que são aceitas. São essas duas que ficam no bloco do mercado, de propósito.
              </Banner>

              {num.apuradoEm && (
                <p className="text-center text-[11px] text-muted">
                  Apurado em {new Date(num.apuradoEm).toLocaleString('pt-BR')}.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'usuarios' && (
        <div className="mt-5">
          <Input
            placeholder="Buscar por nome, e-mail ou cidade"
            value={query} onChange={(e) => setQuery(e.target.value)}
          />
          <p className="mt-2 text-[12px] text-muted">
            Esta lista inclui contas <strong>suspensas e banidas</strong>, que não aparecem em
            nenhuma outra tela — é daqui que se desfaz uma suspensão.
          </p>
          <Card className="mt-3 divide-y divide-line overflow-hidden">
            {listaDePessoas.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                <Avatar seed={u.id} name={u.nome} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {u.nome}
                    {u.verificada && <Icon name="check" size={12} className="ml-1.5 inline text-sage" />}
                  </p>
                  <p className="truncate text-[12px] text-muted">
                    {u.profissao || 'sem profissão'} · {u.email} · {u.cidade} · reputação {u.reputacao}
                  </p>
                </div>
                {u.plano === 'premium' && <Chip size="sm" tone="ember">plano ativo</Chip>}
                <Chip size="sm" tone={u.status === 'ativo' ? 'sage' : u.status === 'suspenso' ? 'warn' : 'danger'}>
                  {u.status}
                </Chip>
                {u.apagadaEm ? (
                  <Chip size="sm" tone="neutral">apagada</Chip>
                ) : u.status === 'ativo' ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setStatus(u.id, 'suspenso')}>Suspender</Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatus(u.id, 'banido')}>Banir</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setStatus(u.id, 'ativo')}>Reativar</Button>
                )}
              </div>
            ))}
            {listaDePessoas.length === 0 && (
              <p className="p-6 text-center text-sm text-muted">Nenhuma conta encontrada.</p>
            )}
          </Card>
        </div>
      )}

      {tab === 'anuncios' && (
        <div className="mt-5 space-y-4">
          {/* Esta é a única tela do sistema que mostra RASCUNHO, FECHADO e
              VENCIDO. A policy de `anuncios` abre tudo para o administrador; as
              outras telas só veem o que está aberto. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              value={filtro.tipo ?? 'todos'}
              onChange={(e) => setFiltro((f) => ({ ...f, tipo: e.target.value as TipoAnuncio | 'todos' }))}
            >
              <option value="todos">Procuras e ofertas</option>
              <option value="procurando">Só quem procura serviço</option>
              <option value="oferecendo">Só quem oferece serviço</option>
            </Select>
            <Select
              value={filtro.status ?? 'todos'}
              onChange={(e) => setFiltro((f) => ({ ...f, status: e.target.value as StatusAnuncio | 'todos' }))}
            >
              <option value="todos">Qualquer situação</option>
              <option value="aberto">Aberto</option>
              <option value="rascunho">Rascunho</option>
              <option value="fechado">Fechado</option>
              <option value="concluido">Concluído</option>
              <option value="cancelado">Cancelado</option>
            </Select>
            <Input
              placeholder="Buscar por título ou cidade"
              value={filtro.busca ?? ''}
              onChange={(e) => setFiltro((f) => ({ ...f, busca: e.target.value }))}
            />
          </div>

          {!supabaseEnabled && (
            <Banner tone="info" icon="info" title="Sem servidor">
              No modo demonstração não há base de anúncios para listar aqui.
            </Banner>
          )}

          {supabaseEnabled && anuncios === null && (
            <Card className="p-5"><p className="text-[14px] text-muted">Carregando…</p></Card>
          )}

          {supabaseEnabled && anuncios?.length === 0 && (
            <Empty icon="search" title="Nenhum anúncio com esse filtro"
                   body="Limpe o filtro ou procure por outra palavra." />
          )}

          {!!anuncios?.length && (
            <Card className="divide-y divide-line overflow-hidden">
              {anuncios.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.titulo}</p>
                    <p className="truncate text-[12px] text-muted">
                      {a.cidade}{a.uf ? `, ${a.uf}` : ''} · publicado {timeAgo(a.criadoEm)}
                      {a.expiraEm && new Date(a.expiraEm).getTime() < Date.now() ? ' · vencido' : ''}
                    </p>
                  </div>
                  <Chip size="sm" tone={a.tipo === 'procurando' ? 'brand' : 'ember'}>
                    {a.tipo === 'procurando' ? 'procura' : 'oferece'}
                  </Chip>
                  <Chip size="sm" tone={a.status === 'aberto' ? 'sage' : a.status === 'cancelado' ? 'danger' : 'neutral'}>
                    {a.status}
                  </Chip>
                  <Chip size="sm" tone={a.propostas > 0 ? 'sage' : 'neutral'}>
                    {a.propostas} {a.propostas === 1 ? 'proposta' : 'propostas'}
                  </Chip>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {tab === 'planos' && (
        <div className="mt-5 space-y-4">
          <Banner tone="warn" icon="info" title="O que você muda aqui é o que o cartão paga">
            Este preço é o <strong>mesmo</strong> que a tela de Planos mostra e que o Stripe cobra —
            não há dois números. Quem <strong>já</strong> assinou mantém o valor que contratou: mudar
            aqui vale só para assinaturas novas.
          </Banner>

          {!supabaseEnabled && (
            <Banner tone="info" icon="info" title="Sem servidor">
              No modo demonstração os preços são fixos e não há o que editar.
            </Banner>
          )}

          {supabaseEnabled && planos === null && (
            <Card className="p-5"><p className="text-[14px] text-muted">Carregando…</p></Card>
          )}

          {planos?.map((plano) => {
            const digitado = rascunhoPreco[plano.codigo] ?? '';
            const novo = digitado ? paraCentavos(digitado) : null;
            const mudou = novo !== null && novo !== plano.centavos;
            return (
              <Card key={plano.codigo} className="space-y-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-bold">{plano.nome}</p>
                    <p className="text-[13px] text-muted">
                      hoje: <strong>{emReais(plano.centavos)}</strong>{porPeriodo(plano)}
                    </p>
                  </div>
                  <Chip size="sm" tone={plano.ativo ? 'sage' : 'neutral'}>
                    {plano.ativo ? 'à venda' : 'fora de venda'}
                  </Chip>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[160px] flex-1">
                    <label className="block text-[12px] font-semibold text-muted" htmlFor={`preco-${plano.codigo}`}>
                      Novo preço, em reais
                    </label>
                    <Input
                      id={`preco-${plano.codigo}`} inputMode="decimal" placeholder="49,90"
                      value={digitado}
                      onChange={(e) => setRascunhoPreco((r) => ({ ...r, [plano.codigo]: e.target.value }))}
                    />
                  </div>
                  <Button
                    variant="primary" loading={salvando === plano.codigo}
                    disabled={!mudou}
                    onClick={() => { if (novo !== null) void guardarPlano(plano, { centavos: novo }); }}
                  >
                    Salvar preço
                  </Button>
                  <Button
                    variant="outline" loading={salvando === plano.codigo}
                    onClick={() => void guardarPlano(plano, { ativo: !plano.ativo })}
                  >
                    {plano.ativo ? 'Tirar de venda' : 'Pôr à venda'}
                  </Button>
                </div>

                {/* A tela repete de volta o que ENTENDEU antes de salvar. É o
                    que transforma um dedo escorregado em algo visível: quem
                    digitar 4,90 por engano lê "vai passar a custar R$ 4,90". */}
                {digitado && novo === null && (
                  <p className="text-[13px] font-semibold text-ember">
                    Não entendi esse valor. Escreva como 49,90.
                  </p>
                )}
                {novo !== null && (
                  <p className="text-[13px]">
                    {mudou
                      ? <>Vai passar a custar <strong>{emReais(novo)}</strong>{porPeriodo(plano)} para quem assinar daqui em diante.</>
                      : <>Esse já é o preço atual.</>}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'denuncias' && (
        <div className="mt-5 space-y-3">
          {state.reports.length === 0 && <Empty icon="shield" title="Nenhuma denúncia" body="Quando alguém denunciar um perfil, ela aparece aqui." />}
          {state.reports.map((r) => {
            const reporter = findUser(state, r.reporterId);
            const reported = findUser(state, r.reportedId);
            return (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {firstName(reported?.name ?? '—')} denunciado(a) por {firstName(reporter?.name ?? '—')}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {REPORT_REASON_LABEL[r.reason]} · {timeAgo(r.createdAt)} atrás · {r.evidenceMessageIds.length} mensagem(ns) anexada(s)
                    </p>
                  </div>
                  <Chip size="sm" tone={r.status === 'aberta' ? 'warn' : r.status === 'procedente' ? 'danger' : r.status === 'improcedente' ? 'sage' : 'neutral'}>
                    {r.status}
                  </Chip>
                </div>
                {r.description && <p className="mt-2 rounded-2xl bg-bg p-3 text-[13px] leading-relaxed">{r.description}</p>}
                {r.adminNote && <p className="mt-2 text-[12px] text-muted">Nota da equipe: {r.adminNote}</p>}
                {(r.status === 'aberta' || r.status === 'em_analise') && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => resolveReport(r.id, 'em_analise', 'Em apuração pela equipe.')}>Marcar em análise</Button>
                    <Button
                      size="sm" variant="danger"
                      onClick={() => { resolveReport(r.id, 'procedente', 'Conta suspensa após análise humana.'); if (reported) setStatus(reported.id, 'suspenso'); }}
                    >
                      Procedente e suspender
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => resolveReport(r.id, 'improcedente', 'Sem violação identificada.')}>Improcedente</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'moderacao' && (
        <div className="mt-5 space-y-3">
          <Banner tone="info" icon="shield" title="Como funciona a fila">
            A camada 1 é uma heurística local que roda antes do envio. A camada 2, opcional, usa o Gemini
            para classificar o que a heurística marcou. As duas apenas sinalizam — quem decide é você.
          </Banner>
          {state.moderationQueue.length === 0 && <Empty icon="shield" title="Fila vazia" body="Nenhuma mensagem sinalizada no momento." />}
          {state.moderationQueue.map((item) => {
            const author = findUser(state, item.authorId);
            return (
              <Card key={item.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{author?.name ?? 'Usuário removido'}</p>
                    <p className="text-[12px] text-muted">{timeAgo(item.createdAt)} atrás · fonte: {item.result.source}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip size="sm" tone={item.result.level === 'risco' ? 'danger' : 'warn'}>{item.result.level}</Chip>
                    {item.result.categories.map((c) => (
                      <Chip key={c} size="sm">{CATEGORY_LABEL[c] ?? c}</Chip>
                    ))}
                  </div>
                </div>
                <p className="mt-2 rounded-2xl bg-bg p-3 text-[13px] italic leading-relaxed">“{item.excerpt}”</p>
                <p className="mt-2 text-[12px] text-muted">{item.result.advice}</p>
                {item.status === 'pendente' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => decidirModeracao(item.id, 'liberado')}>
                      Liberar (falso positivo)
                    </Button>
                    <Button
                      size="sm" variant="danger"
                      onClick={() => { decidirModeracao(item.id, 'removido'); if (author) setStatus(author.id, 'suspenso'); }}
                    >
                      Remover e suspender autor
                    </Button>
                  </div>
                ) : (
                  <Chip size="sm" tone={item.status === 'liberado' ? 'sage' : 'danger'}>{item.status}</Chip>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'verificacao' && (
        <div className="mt-5">
          <Banner tone="info" icon="shield" title="Comparação feita por pessoa, não por máquina">
            Confira se a selfie reproduz a pose sorteada e se é a mesma pessoa da foto do perfil.
            Decidir apaga a selfie do servidor — ela existe só para esta decisão.
          </Banner>
          <FilaVerificacao />
        </div>
      )}

    </Page>
  );
}
