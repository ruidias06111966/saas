import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Banner, Button, Card, Empty, Icon, Modal, Textarea } from './ui';
import { Portrait } from './Portrait';
import { type QueueItem, decide, reviewQueue, selfieUrl } from '../services/verification';
import { supabaseEnabled } from '../services/supabaseClient';
import { age, timeAgo } from '../services/utils';

// ---------------------------------------------------------------------------
// A fila de revisão de verificação.
//
// O revisor vê lado a lado a selfie e a foto do perfil sem véu — administrador
// tem nível 4 em qualquer retrato, e isso está declarado em nivel_permitido().
//
// A recusa exige motivo porque a pessoa vai lê-lo. Recusar sem dizer por quê
// deixa alguém sem saber o que corrigir, e é o tipo de coisa que faz a pessoa
// tentar de novo do mesmo jeito.
// ---------------------------------------------------------------------------

export function FilaVerificacao() {
  const { toast } = useApp();
  const [itens, setItens] = useState<QueueItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [recusando, setRecusando] = useState<QueueItem | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState('');

  const carregar = useCallback(async () => {
    if (!supabaseEnabled) { setCarregando(false); return; }
    try {
      setItens(await reviewQueue());
      setErro('');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const decidir = async (item: QueueItem, aprovar: boolean, razao = '') => {
    setOcupado(item.id);
    try {
      await decide(item.id, aprovar, razao);
      setItens((xs) => xs.filter((x) => x.id !== item.id));
      toast(aprovar ? `${item.name} verificada.` : `Pedido de ${item.name} recusado.`, aprovar ? 'ok' : 'info');
    } catch (e) {
      toast((e as Error).message, 'danger');
    } finally {
      setOcupado('');
      setRecusando(null);
      setMotivo('');
    }
  };

  if (!supabaseEnabled) {
    return (
      <Banner tone="info" icon="info" title="Só no modo online">
        A verificação por selfie depende do Storage e das Edge Functions.
      </Banner>
    );
  }
  if (carregando) return <p className="mt-4 text-[13px] text-muted">Carregando a fila…</p>;
  if (erro) return <Banner tone="danger" icon="info" title="Falha ao abrir a fila">{erro}</Banner>;
  if (!itens.length) {
    return <Empty icon="shield" title="Nenhum pedido na fila" body="Quando alguém pedir verificação, aparece aqui." />;
  }

  return (
    <>
      <div className="mt-4 space-y-4">
        {itens.map((item) => (
          <ItemDaFila
            key={item.id} item={item} ocupado={ocupado === item.id}
            onAprovar={() => decidir(item, true)}
            onRecusar={() => { setRecusando(item); setMotivo(''); }}
          />
        ))}
      </div>

      <Modal
        open={!!recusando} onClose={() => setRecusando(null)} title="Recusar a verificação"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecusando(null)}>Cancelar</Button>
            <Button
              variant="danger" disabled={motivo.trim().length < 8}
              loading={!!ocupado}
              onClick={() => recusando && decidir(recusando, false, motivo.trim())}
            >
              Recusar e avisar
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">
          O motivo vai inteiro para a pessoa. Escreva o que ela precisa corrigir — “a pose não
          confere”, “rosto encoberto”, “foto muito escura”.
        </p>
        <Textarea
          className="mt-3" value={motivo} onChange={(e) => setMotivo(e.target.value)}
          placeholder="Por que este pedido não pôde ser aprovado?" maxLength={500}
        />
      </Modal>
    </>
  );
}

function ItemDaFila({
  item, ocupado, onAprovar, onRecusar,
}: { item: QueueItem; ocupado: boolean; onAprovar: () => void; onRecusar: () => void }) {
  const [selfie, setSelfie] = useState<string | undefined>();
  const [semSelfie, setSemSelfie] = useState(false);

  useEffect(() => {
    let vivo = true;
    selfieUrl(item.userId, item.id).then((u) => {
      if (!vivo) return;
      if (u) setSelfie(u); else setSemSelfie(true);
    });
    return () => { vivo = false; };
  }, [item.userId, item.id]);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="font-semibold">{item.name}</p>
        <p className="text-[12px] text-muted">
          {age(item.birthDate)} anos · {item.city} · pediu {timeAgo(item.createdAt)}
        </p>
      </div>

      <div className="mt-3 rounded-2xl border border-brand/30 bg-brandSoft p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand">Pose sorteada</p>
        <p className="mt-0.5 text-[13px] font-medium">{item.pose}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <figure>
          <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Selfie</figcaption>
          {selfie ? (
            <img src={selfie} alt="" className="aspect-[3/4] w-full rounded-2xl object-cover" />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl border border-dashed border-line text-center text-[11px] text-muted">
              {semSelfie ? 'Ainda não enviou a selfie' : 'Carregando…'}
            </div>
          )}
        </figure>
        <figure>
          <figcaption className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Foto do perfil</figcaption>
          <Portrait
            seed={item.userId} photo={item.photoBase} name={item.name} reveal={1}
            className="aspect-[3/4] w-full"
          />
        </figure>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" icon="check" loading={ocupado} disabled={!selfie} onClick={onAprovar}>
          Aprovar e dar o selo
        </Button>
        <Button size="sm" variant="outline" icon="close" disabled={ocupado} onClick={onRecusar}>
          Recusar
        </Button>
        {!selfie && !semSelfie && <span className="self-center text-[11px] text-muted">aguardando a imagem…</span>}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
        <Icon name="shield" size={12} className="mt-0.5 shrink-0" />
        Decidir apaga a selfie do servidor, aprovando ou recusando.
      </p>
    </Card>
  );
}
