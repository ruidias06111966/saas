import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Page } from '../components/layout/AppShell';
import { Button, Card, Chip, Empty, Field, Icon, Input, Select } from '../components/ui';
import { UFS } from '../services/localizacao';
import {
  type Anuncio, type Categoria, type FiltroBusca, type Modalidade, type TipoAnuncio,
  MODALIDADE_LABEL, OUTRA_PONTA, POR_PAGINA, buscarAnuncios, faixaDeOrcamento,
  listarCategorias, ondeFica,
} from '../services/mercado';

// ---------------------------------------------------------------------------
// O quadro de anúncios — a tela principal do QICONEXÃO profissional.
//
// Substitui a Descobrir, e a diferença não é cosmética. A Descobrir EMPURRAVA
// uma seleção de cinco pessoas por dia; aqui a pessoa PROCURA. Num mercado de
// trabalho ninguém quer receber uma seleção amanhã: quer achar hoje quem paga
// pelo que sabe fazer, filtrando por categoria, cidade e palavra.
//
// A busca por texto vai para a mesma configuração do banco, que ignora
// acentos: quem digita "construcao" encontra "construção". Ver
// services/mercado.ts e a migração 008.
//
// DUAS ÁREAS, UMA TELA
//
// A pessoa chega com uma de duas perguntas, e a tela tem de responder a
// certa na primeira olhada:
//
//   PROCURAR SERVIÇO → "preciso de alguém"  → vê quem OFERECE
//   OFERECER SERVIÇO → "quero trabalho"     → vê quem PROCURA
//
// Em cada área ela publica o SEU lado e vê o lado OPOSTO. É por isso que
// `MOLDURA` guarda `publica` e a lista usa `OUTRA_PONTA`: confundir os dois
// mostraria à pessoa exatamente o que ela não veio ver.
// ---------------------------------------------------------------------------

/** Tudo o que muda entre as duas áreas do mercado. */
const MOLDURA: Record<TipoAnuncio, {
  titulo: string; vazioTitulo: string; vazioTexto: string; botao: string;
}> = {
  // Área PROCURAR: eu publico uma procura, e vejo as ofertas dos outros.
  procurando: {
    titulo: 'Procurar serviço',
    vazioTitulo: 'Ninguém se ofereceu ainda',
    vazioTexto: 'Nenhum profissional publicou serviço nesta categoria por enquanto. Publique o que você precisa — quem souber fazer encontra você.',
    botao: 'Publicar o que preciso',
  },
  // Área OFERECER: eu publico o meu serviço, e vejo quem está procurando.
  oferecendo: {
    titulo: 'Oferecer serviço',
    vazioTitulo: 'Ninguém está procurando ainda',
    vazioTexto: 'Nenhum pedido aberto nesta categoria por enquanto. Publique o que você faz — quem precisar encontra você.',
    botao: 'Oferecer meu serviço',
  },
};

/** A etiqueta que o cartão mostra. É o que responde "isto é o quê?" de longe. */
export const ETIQUETA: Record<TipoAnuncio, { texto: string; icone: 'search' | 'handshake'; classe: string }> = {
  procurando: { texto: 'PROCURANDO', icone: 'search', classe: 'bg-brandSoft text-brand' },
  oferecendo: { texto: 'OFERECENDO', icone: 'handshake', classe: 'bg-ember/12 text-ember' },
};

const quando = (iso: string) => {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  return new Date(iso).toLocaleDateString('pt-BR');
};

function CartaoDoAnuncio({ a, onAbrir }: { a: Anuncio; onAbrir: () => void }) {
  return (
    <Card className="transition-shadow hover:shadow-lift">
      <button type="button" className="w-full p-5 text-left" onClick={onAbrir}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] ${ETIQUETA[a.tipo].classe}`}>
          <Icon name={ETIQUETA[a.tipo].icone} size={11} /> {ETIQUETA[a.tipo].texto}
        </span>
      </div>

      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base font-semibold leading-snug">{a.titulo}</h3>
        <span className="shrink-0 text-[11px] text-muted">{quando(a.createdAt)}</span>
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-muted">{a.descricao}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {a.categoriaNome && <Chip size="sm" tone="brand">{a.categoriaNome}</Chip>}
        <Chip size="sm">{ondeFica(a)}</Chip>
        <Chip size="sm" tone="sage">{faixaDeOrcamento(a)}</Chip>
        {a.prazoDias && <Chip size="sm">{a.prazoDias} dias</Chip>}
        </div>
      </button>
    </Card>
  );
}

/**
 * @param area O lado do mercado em que a pessoa está. Ela PUBLICA deste lado e
 *             VÊ o lado oposto — quem procura vê ofertas, quem oferece vê
 *             procuras.
 */
export function Anuncios({ area }: { area: TipoAnuncio }) {
  const { navigate, toast } = useApp();
  const m = MOLDURA[area];
  /** O que a pessoa VÊ é sempre o contrário do que ela publica. */
  const vendo = OUTRA_PONTA[area];

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [filtro, setFiltro] = useState<FiltroBusca>({ tipo: vendo });
  const [texto, setTexto] = useState('');
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    listarCategorias().then(setCategorias).catch(() => {});
  }, []);

  // Trocar de área pelo menu, sem recarregar a página, tem de trocar a lista.
  // Sem isto a pessoa clica em "Oferecer serviço" e continua vendo ofertas.
  useEffect(() => { setFiltro((f) => ({ ...f, tipo: vendo, pagina: 0 })); }, [vendo]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    buscarAnuncios(filtro)
      .then((r) => { if (vivo) { setAnuncios(r.anuncios); setTotal(r.total); } })
      .catch((e) => { if (vivo) toast((e as Error).message, 'danger'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [filtro, toast]);

  const grupos = useMemo(() => {
    const m = new Map<string, Categoria[]>();
    for (const c of categorias) m.set(c.grupo, [...(m.get(c.grupo) ?? []), c]);
    return [...m.entries()];
  }, [categorias]);

  const mudar = (p: Partial<FiltroBusca>) => setFiltro((f) => ({ ...f, ...p, pagina: 0 }));
  // `tipo` fica de fora: não é um filtro que a pessoa escolheu, é a área em que
  // ela está. Contá-lo faria "Limpar filtros" aparecer sempre, e limpá-lo
  // misturaria os dois quadros.
  const temFiltro = !!(filtro.texto || filtro.categoriaId || filtro.uf || filtro.cidade || filtro.modalidade);
  const pagina = filtro.pagina ?? 0;
  const paginas = Math.ceil(total / POR_PAGINA);

  return (
    <Page
      title={m.titulo}
      subtitle={carregando ? 'Procurando…' : `${total} anúncio(s) aberto(s).`}
      action={
        <Button size="sm" icon="plus" onClick={() => navigate({ name: 'publicar', tipo: area })}>
          {m.botao}
        </Button>
      }
      maxWidth="max-w-4xl"
    >
      <form
        className="mb-5"
        onSubmit={(e) => { e.preventDefault(); mudar({ texto: texto.trim() || undefined }); }}
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" size={17} />
            </span>
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="contador, site, alvará, laudo…"
              className="!pl-10"
              aria-label="Buscar anúncios"
            />
          </div>
          <Button type="submit">Buscar</Button>
        </div>
      </form>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Field label="Categoria">
          <Select
            value={filtro.categoriaId ?? ''}
            onChange={(e) => mudar({ categoriaId: e.target.value || undefined })}
          >
            <option value="">Todas</option>
            {grupos.map(([grupo, itens]) => (
              <optgroup key={grupo} label={grupo}>
                {itens.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>

        <Field label="Estado">
          <Select value={filtro.uf ?? ''} onChange={(e) => mudar({ uf: e.target.value || undefined })}>
            <option value="">Todos</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </Select>
        </Field>

        <Field label="Modalidade">
          <Select
            value={filtro.modalidade ?? ''}
            onChange={(e) => mudar({ modalidade: (e.target.value || undefined) as Modalidade | undefined })}
          >
            <option value="">Todas</option>
            {(['remoto', 'presencial', 'hibrido'] as const).map((m) => (
              <option key={m} value={m}>{MODALIDADE_LABEL[m]}</option>
            ))}
          </Select>
        </Field>
      </div>

      {temFiltro && (
        <div className="mb-4">
          <Button
            size="sm" variant="ghost"
            onClick={() => { setTexto(''); setFiltro({ tipo: vendo }); }}
          >
            Limpar filtros
          </Button>
        </div>
      )}

      {carregando ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Card key={i} className="h-28 animate-pulseSoft"><span /></Card>)}
        </div>
      ) : anuncios.length === 0 ? (
        <Empty
          icon="search"
          title={temFiltro ? 'Nada com esses filtros' : m.vazioTitulo}
          body={temFiltro
            ? 'Tente outras palavras, ou limpe os filtros para ver tudo o que está aberto.'
            : m.vazioTexto}
          action={temFiltro
            ? <Button size="sm" variant="outline" onClick={() => { setTexto(''); setFiltro({ tipo: vendo }); }}>Limpar filtros</Button>
            : <Button size="sm" icon="plus" onClick={() => navigate({ name: 'publicar', tipo: area })}>{m.botao}</Button>}
        />
      ) : (
        <>
          <div className="space-y-3">
            {anuncios.map((a) => (
              <CartaoDoAnuncio key={a.id} a={a} onAbrir={() => navigate({ name: 'anuncio', id: a.id })} />
            ))}
          </div>

          {paginas > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                size="sm" variant="outline" disabled={pagina === 0}
                onClick={() => setFiltro((f) => ({ ...f, pagina: pagina - 1 }))}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted">Página {pagina + 1} de {paginas}</span>
              <Button
                size="sm" variant="outline" disabled={pagina + 1 >= paginas}
                onClick={() => setFiltro((f) => ({ ...f, pagina: pagina + 1 }))}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
