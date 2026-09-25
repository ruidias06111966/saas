import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Chip, Empty, Tabs } from '../components/ui';
import {
  type Proposta,
  dinheiro, minhasPropostas, responderProposta, STATUS_PROPOSTA_LABEL,
} from '../services/mercado';

// ---------------------------------------------------------------------------
// Onde eu me ofereci.
//
// Do outro lado do anúncio. Aqui a pessoa acompanha o que enviou e descobre o
// que foi aceito — a proposta aceita é o único evento do app que vale dinheiro,
// então ela ganha destaque em vez de virar mais uma linha da lista.
//
// "Recusada" aparece como "Não escolhida", e a diferença não é eufemismo: num
// anúncio com dez propostas, nove são recusadas sem que nada tenha havido de
// errado com elas. Ver STATUS_PROPOSTA_LABEL em services/mercado.ts.
// ---------------------------------------------------------------------------

type Aba = 'aguardando' | 'aceitas' | 'encerradas';

function Cartao({ p, onAbrir, onRetirar }: {
  p: Proposta; onAbrir: () => void; onRetirar: () => void;
}) {
  const tom = p.status === 'aceita' ? 'sage' : p.status === 'enviada' ? 'brand' : 'neutral';

  return (
    <Card className={p.status === 'aceita' ? 'border-sage/40 p-5' : 'p-5'}>
      <button type="button" className="w-full text-left" onClick={onAbrir}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-base font-semibold leading-snug">
            {p.anuncio?.titulo ?? 'Anúncio indisponível'}
          </h3>
          <Chip size="sm" tone={tom}>{STATUS_PROPOSTA_LABEL[p.status]}</Chip>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.valor != null && <Chip size="sm">{dinheiro(p.valor)}</Chip>}
          {p.prazoDias != null && <Chip size="sm">{p.prazoDias} dias</Chip>}
          <span className="text-[11px] text-muted">
            enviada em {new Date(p.createdAt).toLocaleDateString('pt-BR')}
          </span>
        </div>

        <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-muted">{p.mensagem}</p>
      </button>

      {p.status === 'aceita' && (
        <div className="mt-4">
          <Banner tone="ok" icon="handshake" title="Sua proposta foi aceita">
            Combine os próximos passos com quem publicou. Abra o anúncio para ver quem é.
          </Banner>
        </div>
      )}

      {p.status === 'enviada' && (
        <div className="mt-4 border-t border-line pt-3">
          <Button size="sm" variant="ghost" onClick={onRetirar}>Retirar proposta</Button>
        </div>
      )}
    </Card>
  );
}

export function MinhasPropostas() {
  const { me, navigate, toast } = useApp();

  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>('aguardando');

  const carregar = useCallback(async () => {
    if (!me) return;
    setCarregando(true);
    try {
      setPropostas(await minhasPropostas(me.id));
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setCarregando(false);
    }
  }, [me, toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  const grupos = useMemo(() => ({
    aguardando: propostas.filter((p) => p.status === 'enviada'),
    aceitas: propostas.filter((p) => p.status === 'aceita'),
    encerradas: propostas.filter((p) => p.status === 'recusada' || p.status === 'retirada'),
  }), [propostas]);

  // Quem tem uma proposta aceita quer ver isso primeiro, não depois de trocar
  // de aba. Só escolhe uma vez, no primeiro carregamento.
  useEffect(() => {
    if (!carregando && grupos.aceitas.length > 0 && grupos.aguardando.length === 0) setAba('aceitas');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando]);

  const lista = grupos[aba];

  const retirar = async (p: Proposta) => {
    try {
      await responderProposta(p.id, 'retirada');
      toast('Proposta retirada.', 'info');
      await carregar();
    } catch (e) {
      toast((e as Error).message, 'danger');
    }
  };

  if (!me) return null;

  const VAZIO: Record<Aba, { titulo: string; corpo: string }> = {
    aguardando: {
      titulo: 'Nenhuma proposta esperando resposta',
      corpo: 'Quando você se oferecer em um anúncio, ela fica aqui até quem publicou decidir.',
    },
    aceitas: {
      titulo: 'Nenhuma proposta aceita ainda',
      corpo: 'Propostas que explicam COMO você faria e citam algo parecido que já fez são as que costumam ser escolhidas.',
    },
    encerradas: {
      titulo: 'Nada encerrado',
      corpo: 'Propostas não escolhidas ou retiradas por você aparecem aqui.',
    },
  };

  return (
    <Page
      title="Minhas propostas"
      subtitle="Onde você se ofereceu, e no que deu."
      action={
        <Button size="sm" icon="search" variant="outline" onClick={() => navigate({ name: 'anuncios' })}>
          Ver anúncios
        </Button>
      }
    >
      {carregando ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <Card key={i} className="h-36 animate-pulseSoft"><span /></Card>)}
        </div>
      ) : propostas.length === 0 ? (
        <Empty
          icon="send"
          title="Você ainda não enviou propostas"
          body="Procure no quadro de anúncios um trabalho que você sabe fazer e se ofereça. Propostas específicas ganham das genéricas quase sempre."
          action={<Button size="sm" icon="search" onClick={() => navigate({ name: 'anuncios' })}>Procurar trabalho</Button>}
        />
      ) : (
        <>
          <div className="mb-5">
            <Tabs<Aba>
              value={aba}
              onChange={setAba}
              tabs={[
                { id: 'aguardando', label: 'Aguardando', count: grupos.aguardando.length },
                { id: 'aceitas', label: 'Aceitas', count: grupos.aceitas.length },
                { id: 'encerradas', label: 'Encerradas', count: grupos.encerradas.length },
              ]}
            />
          </div>

          {lista.length === 0 ? (
            <Empty
              icon={aba === 'aceitas' ? 'handshake' : aba === 'aguardando' ? 'clock' : 'check'}
              title={VAZIO[aba].titulo}
              body={VAZIO[aba].corpo}
              action={aba !== 'encerradas'
                ? <Button size="sm" icon="search" onClick={() => navigate({ name: 'anuncios' })}>Procurar trabalho</Button>
                : undefined}
            />
          ) : (
            <div className="space-y-3">
              {lista.map((p) => (
                <Cartao
                  key={p.id}
                  p={p}
                  onAbrir={() => navigate({ name: 'anuncio', id: p.anuncioId })}
                  onRetirar={() => retirar(p)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Page>
  );
}
