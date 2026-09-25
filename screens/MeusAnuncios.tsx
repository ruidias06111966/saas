import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Page } from '../components/layout/AppShell';
import { Button, Card, Chip, Empty, Modal, Tabs } from '../components/ui';
import {
  type Anuncio, type StatusAnuncio,
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

function Cartao({ a, onAbrir, onEncerrar }: {
  a: Anuncio; onAbrir: () => void; onEncerrar: () => void;
}) {
  const aberto = estaAberto(a);
  const n = a.propostas ?? 0;

  return (
    <Card className="p-5">
      <button type="button" className="w-full text-left" onClick={onAbrir}>
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

      {aberto && (
        <div className="mt-4 border-t border-line pt-3">
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

  const { abertos, encerrados } = useMemo(() => ({
    abertos: anuncios.filter(estaAberto),
    encerrados: anuncios.filter((a) => !estaAberto(a)),
  }), [anuncios]);

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
        <Button size="sm" icon="plus" onClick={() => navigate({ name: 'publicar' })}>
          Publicar
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
          body="Publique o que precisa e deixe as propostas virem até você. Leva dois minutos, e o anúncio fica aberto por 30 dias."
          action={<Button size="sm" icon="plus" onClick={() => navigate({ name: 'publicar' })}>Publicar um anúncio</Button>}
        />
      ) : (
        <>
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
              title={aba === 'abertos' ? 'Nenhum anúncio aberto' : 'Nada encerrado ainda'}
              body={aba === 'abertos'
                ? 'Todos os seus anúncios já foram encerrados ou venceram. Publique outro quando precisar.'
                : 'Quando um anúncio for concluído, cancelado ou vencer o prazo, ele aparece aqui.'}
              action={aba === 'abertos'
                ? <Button size="sm" icon="plus" onClick={() => navigate({ name: 'publicar' })}>Publicar</Button>
                : undefined}
            />
          ) : (
            <div className="space-y-3">
              {lista.map((a) => (
                <Cartao
                  key={a.id}
                  a={a}
                  onAbrir={() => navigate({ name: 'anuncio', id: a.id })}
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
