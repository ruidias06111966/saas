import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Page } from '../components/layout/AppShell';
import { Button, Card, Chip, Empty, Icon, Modal, Tabs } from '../components/ui';
import { ETIQUETA } from './Anuncios';
import {
  type Anuncio, type TipoAnuncio, type StatusAnuncio,
  encerrarAnuncio, faixaDeOrcamento, meusAnuncios, ondeFica,
} from '../services/mercado';

// ---------------------------------------------------------------------------
// O que eu publiquei, e quem respondeu.
//
// A contagem de propostas é o número que importa nesta tela: é o sinal de que
// o anúncio funcionou. Ela vem do banco, e só o dono a enxerga — a RLS não
// devolve as linhas de propostas de outra pessoa nem para contar.
// ---------------------------------------------------------------------------

type Aba = 'abertos' | 'encerrados';

const STATUS_LABEL: Record<StatusAnuncio, string> = {
  rascunho: 'Rascunho',
  aberto: 'Aberto',
  fechado: 'Encerrado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const venceu = (a: Anuncio) => new Date(a.expiresAt) <= new Date();
const estaAberto = (a: Anuncio) => a.status === 'aberto' && !venceu(a);

function Cartao({ a, onAbrir, onEditar, onEncerrar }: {
  a: Anuncio; onAbrir: () => void; onEditar: () => void; onEncerrar: () => void;
}) {
  const aberto = estaAberto(a);
  const n = a.propostas ?? 0;

  return (
    <Card className="p-5">
      <button type="button" className="w-full text-left" onClick={onAbrir}>
        {/* A etiqueta é a mesma do quadro público, vinda do mesmo lugar. Dois
            rótulos parecidos, escritos em dois arquivos, divergem. */}
        <span className={`mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] ${ETIQUETA[a.tipo].classe}`}>
          <Icon name={ETIQUETA[a.tipo].icone} size={11} /> {ETIQUETA[a.tipo].texto}
        </span>

        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-base font-semibold leading-snug">{a.titulo}</h3>
          <Chip size="sm" tone={aberto ? 'sage' : 'neutral'}>
            {aberto ? 'Aberto' : venceu(a) && a.status === 'aberto' ? 'Prazo vencido' : STATUS_LABEL[a.status]}
          </Chip>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {a.categoriaNome && <Chip size="sm" tone="brand">{a.categoriaNome}</Chip>}
          <Chip size="sm">{ondeFica(a)}</Chip>
          <Chip size="sm">{faixaDeOrcamento(a)}</Chip>
        </div>

        <p className="mt-3 text-sm">
          {n === 0
            ? <span className="text-muted">Nenhuma proposta ainda.</span>
            : <span className="font-semibold text-brand">{n} proposta{n > 1 ? 's' : ''} — toque para ver</span>}
        </p>

        <p className="mt-1 text-[11px] text-muted">
          {aberto
            ? `Aberto até ${new Date(a.expiresAt).toLocaleDateString('pt-BR')}`
            : `Publicado em ${new Date(a.createdAt).toLocaleDateString('pt-BR')}`}
        </p>
      </button>

      {/* EDITAR SÓ ENQUANTO ESTÁ ABERTO.
          Reescrever um anúncio concluído ou cancelado mudaria, depois do facto,
          o que foi combinado — e as propostas que ele recebeu passariam a
          responder a um texto que já não é o que estava lá. Quem quer outra
          coisa publica outra. Esta é a razão de os dois botões viverem dentro do
          mesmo `aberto`. */}
      {aberto && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button size="sm" variant="outline" icon="edit" onClick={onEditar}>Editar</Button>
          <Button size="sm" variant="ghost" onClick={onEncerrar}>Encerrar anúncio</Button>
        </div>
      )}
    </Card>
  );
}

export function MeusAnuncios() {
  const { me, navigate, toast } = useApp();

  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>('abertos');
  /**
   * Qual lado do mercado a pessoa está olhando. Separado das abas de propósito:
   * "procurados" e "oferecidos" são coisas diferentes, não estados da mesma
   * coisa. Misturá-los numa lista só é exatamente a confusão a evitar.
   */
  const [lado, setLado] = useState<TipoAnuncio>('procurando');
  const [encerrando, setEncerrando] = useState<Anuncio | null>(null);

  const carregar = useCallback(async () => {
    if (!me) return;
    setCarregando(true);
    try {
      setAnuncios(await meusAnuncios(me.id));
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setCarregando(false);
    }
  }, [me, toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  /** Quantos há de cada lado — o número vai no seletor, para a pessoa saber
   *  que o outro lado existe mesmo quando este está vazio. */
  const porLado = useMemo(() => ({
    procurando: anuncios.filter((a) => a.tipo === 'procurando').length,
    oferecendo: anuncios.filter((a) => a.tipo === 'oferecendo').length,
  }), [anuncios]);

  const { abertos, encerrados } = useMemo(() => {
    const doLado = anuncios.filter((a) => a.tipo === lado);
    return {
      abertos: doLado.filter(estaAberto),
      encerrados: doLado.filter((a) => !estaAberto(a)),
    };
  }, [anuncios, lado]);

  const lista = aba === 'abertos' ? abertos : encerrados;

  const confirmarEncerramento = async (status: 'concluido' | 'cancelado') => {
    if (!encerrando) return;
    try {
      await encerrarAnuncio(encerrando.id, status);
      toast(status === 'concluido'
        ? 'Anúncio marcado como concluído.'
        : 'Anúncio cancelado. Ele sai do quadro.', 'ok');
      setEncerrando(null);
      await carregar();
    } catch (e) {
      toast((e as Error).message, 'danger');
    }
  };

  if (!me) return null;

  return (
    <Page
      title="Meus anúncios"
      subtitle="O que você publicou e as propostas que chegaram."
      action={
        <Button size="sm" icon="plus" onClick={() => navigate({ name: 'publicar', tipo: lado })}>
          {lado === 'procurando' ? 'Publicar o que preciso' : 'Oferecer meu serviço'}
        </Button>
      }
    >
      {carregando ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <Card key={i} className="h-36 animate-pulseSoft"><span /></Card>)}
        </div>
      ) : anuncios.length === 0 ? (
        <Empty
          icon="plus"
          title="Você ainda não publicou nada"
          body="Você pode publicar o que precisa, oferecer o que sabe fazer, ou as duas coisas. É de graça, leva dois minutos, e cada anúncio fica aberto por 30 dias."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" icon="search" onClick={() => navigate({ name: 'publicar', tipo: 'procurando' })}>
                Publicar o que preciso
              </Button>
              <Button size="sm" variant="outline" icon="handshake" onClick={() => navigate({ name: 'publicar', tipo: 'oferecendo' })}>
                Oferecer meu serviço
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Chip active={lado === 'procurando'} onClick={() => setLado('procurando')}>
              <Icon name="search" size={13} /> Serviços que procuro ({porLado.procurando})
            </Chip>
            <Chip active={lado === 'oferecendo'} onClick={() => setLado('oferecendo')}>
              <Icon name="handshake" size={13} /> Serviços que ofereço ({porLado.oferecendo})
            </Chip>
          </div>

          <div className="mb-5">
            <Tabs<Aba>
              value={aba}
              onChange={setAba}
              tabs={[
                { id: 'abertos', label: 'Abertos', count: abertos.length },
                { id: 'encerrados', label: 'Encerrados', count: encerrados.length },
              ]}
            />
          </div>

          {lista.length === 0 ? (
            <Empty
              icon={aba === 'abertos' ? 'plus' : 'clock'}
              title={aba === 'abertos'
                ? (lado === 'procurando' ? 'Nenhuma procura aberta' : 'Nenhuma oferta aberta')
                : 'Nada encerrado ainda'}
              body={aba === 'abertos'
                ? 'Nada aberto deste lado por enquanto. Publique quando precisar — é de graça.'
                : 'Quando um anúncio for concluído, cancelado ou vencer o prazo, ele aparece aqui.'}
              action={aba === 'abertos'
                ? (
                  <Button size="sm" icon="plus" onClick={() => navigate({ name: 'publicar', tipo: lado })}>
                    {lado === 'procurando' ? 'Publicar o que preciso' : 'Oferecer meu serviço'}
                  </Button>
                )
                : undefined}
            />
          ) : (
            <div className="space-y-3">
              {lista.map((a) => (
                <Cartao
                  key={a.id}
                  a={a}
                  onAbrir={() => navigate({ name: 'anuncio', id: a.id })}
                  // O `tipo` vem do ANÚNCIO, não do lado que está sendo olhado:
                  // é ele que decide se o campo de prazo aparece, e um lado
                  // errado aqui mudaria o anúncio de face.
                  onEditar={() => navigate({ name: 'publicar', tipo: a.tipo, id: a.id })}
                  onEncerrar={() => setEncerrando(a)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={!!encerrando}
        onClose={() => setEncerrando(null)}
        title="Encerrar anúncio"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEncerrando(null)}>Voltar</Button>
            <Button variant="outline" onClick={() => confirmarEncerramento('cancelado')}>Cancelar anúncio</Button>
            <Button icon="check" onClick={() => confirmarEncerramento('concluido')}>Foi concluído</Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          Ele sai do quadro e deixa de receber propostas. As que já chegaram continuam aqui.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Escolha <strong className="text-ink">Foi concluído</strong> se o trabalho aconteceu, e{' '}
          <strong className="text-ink">Cancelar anúncio</strong> se você desistiu ou resolveu de outro jeito.
        </p>
      </Modal>
    </Page>
  );
}
