import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Chip, Field, Input, Select, SectionTitle, Textarea } from '../components/ui';
import { NOMES_DE_CIDADE, UFS } from '../services/localizacao';
import {
  type Categoria, type Modalidade, type RascunhoAnuncio, type TipoAnuncio, type TipoOrcamento,
  MODALIDADE_LABEL, listarCategorias, publicarAnuncio,
} from '../services/mercado';

// ---------------------------------------------------------------------------
// Publicar — dos dois lados do mercado.
//
// UMA TELA, DUAS FACES, E POR QUE NÃO SÃO DUAS TELAS
//
// Quem PROCURA e quem OFERECE preenchem exatamente os mesmos campos: título,
// categoria, descrição, lugar, modalidade e valor. O que muda é a MOLDURA — o
// título da página, o texto de ajuda, os exemplos e o botão.
//
// Duas telas quase iguais é como elas divergem: uma ganha um campo novo, a
// outra não, e seis meses depois ninguém sabe qual está certa. Foi assim que a
// foto e o crachá passaram a discordar (migração 019). Então aqui é uma tela
// só, e tudo o que difere vive em `TEXTOS`, num lugar onde dá para ler as duas
// versões lado a lado.
//
// A ÚNICA DIFERENÇA DE VERDADE é o prazo: "preciso de contador até outubro"
// tem prazo; "ofereço contabilidade" não tem — o que teria prazo é o serviço,
// que ainda nem foi combinado. O banco RECUSA prazo numa oferta (restrição
// `prazo_so_em_procura`, migração 021), e a tela nem mostra o campo.
//
// O banco recusa anúncio fraco: título de oito caracteres, descrição de trinta,
// lugar obrigatório quando o trabalho exige presença, faixa de orçamento que
// não se inverte. As mesmas regras estão aqui — não para "validar duas vezes",
// mas porque a mensagem do Postgres ("viola a restrição faixa_coerente") não
// serve para ninguém. A regra que VALE continua sendo a do banco; esta aqui só
// existe para que a pessoa descubra o problema antes de clicar.
//
// Ver o comentário das restrições em supabase/migrations/008.
// ---------------------------------------------------------------------------

/**
 * Tudo o que muda entre procurar e oferecer. Se um dia as duas faces
 * precisarem de campos diferentes, é aqui que a diferença aparece primeiro —
 * e é aqui que se decide se ainda vale uma tela só.
 */
const TEXTOS: Record<TipoAnuncio, {
  titulo: string; subtitulo: string; secao: string; dicaSecao: string;
  rotuloTitulo: string; dicaTitulo: string; exemploTitulo: string;
  dicaDescricao: string; exemploDescricao: string;
  secaoValor: string; dicaValor: string; rotuloOrcamento: string;
  botao: string; publicando: string; sucesso: string;
}> = {
  procurando: {
    titulo: 'O que você precisa?',
    subtitulo: 'Publique gratuitamente o serviço que você está procurando. Quem souber fazer responde, e você escolhe.',
    secao: 'O trabalho',
    dicaSecao: 'Título e categoria são o que aparece na busca. Sejam específicos.',
    rotuloTitulo: 'O que você precisa',
    dicaTitulo: '"Contador para MEI em Goiânia" funciona melhor do que "Preciso de ajuda".',
    exemploTitulo: 'Contador para abertura de MEI',
    dicaDescricao: 'diga o que precisa, para quando, e o que já tentou.',
    exemploDescricao: 'Explique o serviço com detalhe. Quanto mais claro o pedido, melhores as propostas — e menos tempo você perde respondendo perguntas.',
    secaoValor: 'Quanto e quando',
    dicaValor: 'Anúncio com valor recebe mais propostas, e propostas mais sérias.',
    rotuloOrcamento: 'Como você paga',
    botao: 'Publicar o que preciso',
    publicando: 'Publicando…',
    sucesso: 'Anúncio publicado. Ele fica aberto por 30 dias.',
  },
  oferecendo: {
    titulo: 'O que você oferece?',
    subtitulo: 'Publique gratuitamente o seu serviço e encontre pessoas que precisam dele.',
    secao: 'O seu serviço',
    dicaSecao: 'Título e categoria são o que aparece na busca. Diga o que você faz, não quem você é.',
    rotuloTitulo: 'O que você faz',
    dicaTitulo: '"Contador para Simples Nacional e MEI" funciona melhor do que "Serviços contábeis".',
    exemploTitulo: 'Contador para Simples Nacional e MEI',
    dicaDescricao: 'diga o que faz, para quem, e o que está incluído.',
    exemploDescricao: 'Explique o seu serviço com detalhe: o que faz, para que tipo de cliente, o que está incluído e o que não está. Quem lê decide se te chama pelo que está escrito aqui.',
    secaoValor: 'Quanto você cobra',
    dicaValor: 'Anúncio com valor recebe mais contatos, e contatos mais sérios. "A combinar" também é uma resposta.',
    rotuloOrcamento: 'Como você cobra',
    botao: 'Oferecer meu serviço',
    publicando: 'Publicando…',
    sucesso: 'Seu serviço está publicado. Ele fica aberto por 30 dias.',
  },
};

const MIN_TITULO = 8;
const MIN_DESCRICAO = 30;
const MAX_TITULO = 120;
const MAX_DESCRICAO = 5000;

const ORCAMENTO_LABEL: Record<TipoOrcamento, string> = {
  fechado: 'Valor fechado',
  por_hora: 'Por hora',
  a_combinar: 'A combinar',
};

const vazio = (tipo: TipoAnuncio): RascunhoAnuncio => ({
  tipo,
  titulo: '',
  descricao: '',
  categoriaId: '',
  modalidade: 'remoto',
  cidade: '',
  uf: '',
  orcamentoTipo: 'a_combinar',
});

export function PublicarAnuncio({ tipo }: { tipo: TipoAnuncio }) {
  const { me, navigate, back, toast } = useApp();
  const t = TEXTOS[tipo];

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [d, setD] = useState<RascunhoAnuncio>(() => vazio(tipo));
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [prazo, setPrazo] = useState('');
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    listarCategorias().then(setCategorias).catch((e) => toast((e as Error).message, 'danger'));
  }, [toast]);

  // A cidade de quem publica é o palpite certo na esmagadora maioria dos casos,
  // e trocá-la custa um clique. Pedir do zero custa mais — e um campo de lugar
  // em branco é o tipo de atrito que faz a pessoa fechar a tela.
  useEffect(() => {
    setD((atual) => ({
      ...atual,
      cidade: atual.cidade || me?.city || '',
      uf: atual.uf || me?.state || '',
    }));
  }, [me?.city, me?.state]);

  // Se a pessoa entrar por "procurar" e depois por "oferecer" sem recarregar,
  // o rascunho tem de acompanhar — senão publicaria do lado errado.
  useEffect(() => {
    setD((atual) => (atual.tipo === tipo ? atual : { ...atual, tipo }));
    if (tipo === 'oferecendo') setPrazo('');
  }, [tipo]);

  const grupos = useMemo(() => {
    const m = new Map<string, Categoria[]>();
    for (const c of categorias) m.set(c.grupo, [...(m.get(c.grupo) ?? []), c]);
    return [...m.entries()];
  }, [categorias]);

  const set = <K extends keyof RascunhoAnuncio>(k: K, v: RascunhoAnuncio[K]) =>
    setD((atual) => ({ ...atual, [k]: v }));

  const precisaDeLugar = d.modalidade !== 'remoto';
  const temFaixa = d.orcamentoTipo !== 'a_combinar';
  /** Prazo é do trabalho a fazer. Quem se oferece não tem prazo a declarar. */
  const temPrazo = tipo === 'procurando';
  const nMin = min ? Number(min) : undefined;
  const nMax = max ? Number(max) : undefined;

  // Uma lista de problemas, não um booleano: assim a pessoa vê tudo o que
  // falta de uma vez, em vez de descobrir um item por tentativa.
  const problemas: string[] = [];
  if (d.titulo.trim().length < MIN_TITULO) problemas.push(`O título precisa de pelo menos ${MIN_TITULO} caracteres.`);
  if (!d.categoriaId) problemas.push('Escolha uma categoria.');
  if (d.descricao.trim().length < MIN_DESCRICAO) problemas.push(`A descrição precisa de pelo menos ${MIN_DESCRICAO} caracteres.`);
  if (precisaDeLugar && !d.cidade?.trim()) problemas.push('Trabalho presencial ou híbrido precisa de cidade.');
  if (precisaDeLugar && !d.uf) problemas.push('Trabalho presencial ou híbrido precisa de estado.');
  if (temFaixa && nMin != null && nMax != null && nMax < nMin) problemas.push('O valor máximo não pode ser menor que o mínimo.');
  if (temPrazo && prazo && (Number(prazo) < 1 || Number(prazo) > 3650)) problemas.push('O prazo precisa estar entre 1 e 3650 dias.');

  const publicar = async () => {
    if (!me) return;
    setTentou(true);
    if (problemas.length > 0) return;
    setEnviando(true);
    try {
      const id = await publicarAnuncio(me.id, {
        ...d,
        orcamentoMin: temFaixa ? nMin : undefined,
        orcamentoMax: temFaixa ? nMax : undefined,
        prazoDias: temPrazo && prazo ? Number(prazo) : undefined,
      });
      toast(t.sucesso, 'ok');
      navigate({ name: 'anuncio', id });
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setEnviando(false);
    }
  };

  if (!me) return null;

  return (
    <Page
      title={t.titulo}
      subtitle={t.subtitulo}
      back={back}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        <Card className="space-y-4 p-5">
          <SectionTitle hint={t.dicaSecao}>{t.secao}</SectionTitle>

          <Field
            label={t.rotuloTitulo}
            required
            hint={`${d.titulo.trim().length}/${MAX_TITULO} — ${t.dicaTitulo}`}
          >
            <Input
              value={d.titulo} maxLength={MAX_TITULO}
              onChange={(e) => set('titulo', e.target.value)}
              placeholder={t.exemploTitulo}
            />
          </Field>

          <Field label="Categoria" required>
            <Select value={d.categoriaId} onChange={(e) => set('categoriaId', e.target.value)}>
              <option value="">Escolha uma…</option>
              {grupos.map(([grupo, itens]) => (
                <optgroup key={grupo} label={grupo}>
                  {itens.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>

          <Field
            label="Descrição"
            required
            hint={`${d.descricao.trim().length}/${MAX_DESCRICAO} — ${t.dicaDescricao}`}
          >
            <Textarea
              rows={6} value={d.descricao} maxLength={MAX_DESCRICAO}
              onChange={(e) => set('descricao', e.target.value)}
              placeholder={t.exemploDescricao}
            />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle hint="Anúncio remoto não pede lugar.">Onde</SectionTitle>

          <div className="flex flex-wrap gap-2">
            {(['remoto', 'presencial', 'hibrido'] as Modalidade[]).map((m) => (
              <Chip key={m} active={d.modalidade === m} onClick={() => set('modalidade', m)}>
                {MODALIDADE_LABEL[m]}
              </Chip>
            ))}
          </div>

          {precisaDeLugar && (
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <Field label="Cidade" required>
                <Input
                  value={d.cidade ?? ''} list="cidades-anuncio"
                  onChange={(e) => set('cidade', e.target.value)}
                  placeholder="Goiânia"
                />
                <datalist id="cidades-anuncio">{NOMES_DE_CIDADE.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Estado" required>
                <Select value={d.uf ?? ''} onChange={(e) => set('uf', e.target.value)}>
                  <option value="">—</option>
                  {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </Select>
              </Field>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle hint={t.dicaValor}>{t.secaoValor}</SectionTitle>

          <Field label={t.rotuloOrcamento}>
            <Select
              value={d.orcamentoTipo}
              onChange={(e) => set('orcamentoTipo', e.target.value as TipoOrcamento)}
            >
              {(Object.keys(ORCAMENTO_LABEL) as TipoOrcamento[]).map((t) => (
                <option key={t} value={t}>{ORCAMENTO_LABEL[t]}</option>
              ))}
            </Select>
          </Field>

          {temFaixa && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="De" hint="Opcional.">
                <Input
                  type="number" min={0} step={50} value={min}
                  onChange={(e) => setMin(e.target.value)} placeholder="R$"
                />
              </Field>
              <Field label="Até" hint="Opcional.">
                <Input
                  type="number" min={0} step={50} value={max}
                  onChange={(e) => setMax(e.target.value)} placeholder="R$"
                />
              </Field>
            </div>
          )}

          {temPrazo && (
            <Field label="Prazo desejado" hint="Em dias. Opcional.">
              <Input
                type="number" min={1} max={3650} value={prazo}
                onChange={(e) => setPrazo(e.target.value)} placeholder="15"
              />
            </Field>
          )}
        </Card>

        {tentou && problemas.length > 0 && (
          <Banner tone="warn" icon="info" title="Falta pouco">
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {problemas.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </Banner>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={publicar} loading={enviando} icon="send">
            {enviando ? t.publicando : t.botao}
          </Button>
          <span className="text-xs text-muted">Fica aberto por 30 dias. Você pode encerrar antes.</span>
        </div>
      </div>
    </Page>
  );
}
