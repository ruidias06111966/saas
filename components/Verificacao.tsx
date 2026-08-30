import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Banner, Button, Card, Checkbox, Chip, Icon, Modal } from './ui';
import {
  type VerificationRequest, consentToSensitiveData, myLastRequest,
  requestVerification, uploadSelfie,
} from '../services/verification';
import { supabaseEnabled } from '../services/supabaseClient';

// ---------------------------------------------------------------------------
// Pedido de verificação de perfil.
//
// A pose vem sorteada do servidor e só aparece DEPOIS do consentimento — é ela
// que torna a selfie difícil de falsificar com uma foto antiga, porque
// reproduzir uma pose específica exige tirar a foto agora.
//
// A câmera é aberta na hora e o quadro vai direto para o Storage: em nenhum
// momento a selfie é guardada no aparelho ou no estado do aplicativo.
// ---------------------------------------------------------------------------

const ESPELHO = 'scaleX(-1)';

export function VerificacaoCard() {
  const { me, toast, refresh } = useApp();
  const [pedido, setPedido] = useState<VerificationRequest | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);

  const recarregar = useCallback(async () => {
    if (!me || !supabaseEnabled) { setCarregando(false); return; }
    setPedido(await myLastRequest(me.id));
    setCarregando(false);
  }, [me]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  if (!me || !supabaseEnabled) return null;

  const emAnalise = pedido?.status === 'pendente';
  const recusado = pedido?.status === 'recusada';

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold">
            <Icon name="shield" size={17} className="text-sage" /> Verificação de perfil
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            {me.verified
              ? 'Seu perfil está verificado. O selo aparece para quem vê você.'
              : emAnalise
                ? 'Sua selfie está na fila de revisão. Costuma levar algumas horas.'
                : 'Uma selfie reproduzindo uma pose sorteada, conferida por uma pessoa da equipe. Perfis verificados recebem mais conversas — e o app fica mais seguro para todo mundo.'}
          </p>
        </div>
        {me.verified && <Chip tone="sage" size="sm"><Icon name="check" size={11} /> Verificado</Chip>}
        {emAnalise && <Chip tone="warn" size="sm">Em análise</Chip>}
      </div>

      {recusado && pedido?.reason && (
        <div className="mt-3">
          <Banner tone="warn" icon="info" title="Verificação não aprovada">
            {pedido.reason}
          </Banner>
        </div>
      )}

      {!me.verified && !emAnalise && !carregando && (
        <Button size="sm" variant="outline" icon="shield" className="mt-4" onClick={() => setAberto(true)}>
          {recusado ? 'Tentar de novo' : 'Pedir verificação'}
        </Button>
      )}

      <ModalVerificacao
        aberto={aberto}
        onFechar={() => setAberto(false)}
        onConcluido={async () => {
          setAberto(false);
          await recarregar();
          await refresh().catch(() => {});
          toast('Selfie enviada. Você recebe um aviso quando houver decisão.', 'ok');
        }}
      />
    </Card>
  );
}

function ModalVerificacao({
  aberto, onFechar, onConcluido,
}: { aberto: boolean; onFechar: () => void; onConcluido: () => void }) {
  const { me, toast } = useApp();
  const [consentiu, setConsentiu] = useState(false);
  const [pose, setPose] = useState('');
  const [pedidoId, setPedidoId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erroCamera, setErroCamera] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const encerrarCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!aberto) {
      encerrarCamera();
      setPose(''); setPedidoId(''); setConsentiu(false); setErroCamera('');
    }
    return encerrarCamera;
  }, [aberto, encerrarCamera]);

  const abrirCamera = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 } }, audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
    } catch {
      // Sem câmera não travamos a pessoa: ela pode enviar um arquivo.
      setErroCamera('Não consegui abrir a câmera. Você pode enviar uma foto do aparelho.');
    }
  }, []);

  const comecar = async () => {
    if (!me) return;
    setOcupado(true);
    try {
      await consentToSensitiveData(me.id);
      const r = await requestVerification();
      setPedidoId(r.id);
      setPose(r.pose);
      await abrirCamera();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setOcupado(false);
    }
  };

  const enviar = async (blob: Blob) => {
    if (!me || !pedidoId) return;
    setOcupado(true);
    try {
      await uploadSelfie(pedidoId, me.id, blob);
      encerrarCamera();
      onConcluido();
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setOcupado(false);
    }
  };

  const capturar = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    const largura = Math.min(720, v.videoWidth);
    const escala = largura / v.videoWidth;
    canvas.width = largura;
    canvas.height = Math.round(v.videoHeight * escala);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Desespelha: a pessoa se vê espelhada, mas o revisor precisa do lado real
    // para conferir "mão direita" de verdade.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (blob) await enviar(blob);
  };

  return (
    <Modal open={aberto} onClose={onFechar} title="Verificar seu perfil">
      {!pose ? (
        <>
          <p className="text-[13px] leading-relaxed text-muted">
            Vamos sortear uma pose e pedir uma selfie reproduzindo ela. Uma pessoa da equipe compara
            com a foto do seu perfil e decide. A pose é sorteada agora, na hora — é isso que impede
            usar uma foto antiga.
          </p>
          <div className="mt-4 rounded-2xl bg-bg p-4">
            <p className="text-[12px] font-semibold">O que acontece com a selfie</p>
            <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-muted">
              <li>• Vai para um espaço privado que <strong>só a equipe de revisão</strong> abre. Nem você relê depois.</li>
              <li>• É <strong>apagada assim que houver decisão</strong>, aprovada ou não.</li>
              <li>• Não vira base de reconhecimento facial, não é comparada por máquina e não sai daqui.</li>
            </ul>
          </div>
          <div className="mt-4">
            <Checkbox checked={consentiu} onChange={setConsentiu}>
              Autorizo o uso da minha selfie para esta verificação, nas condições acima. Imagem de
              rosto é dado pessoal sensível (LGPD, art. 11) e este consentimento é específico para
              esta finalidade.
            </Checkbox>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onFechar}>Agora não</Button>
            <Button icon="shield" disabled={!consentiu} loading={ocupado} onClick={comecar}>
              Sortear a pose
            </Button>
          </div>
        </>
      ) : (
        <>
          <Banner tone="info" icon="sparkle" title="Sua pose">{pose}</Banner>

          {erroCamera ? (
            <div className="mt-4">
              <Banner tone="warn" icon="info">{erroCamera}</Banner>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-4 py-2 text-[13px] font-semibold">
                <Icon name="image" size={15} /> Escolher foto
                <input
                  type="file" accept="image/*" capture="user" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }}
                />
              </label>
            </div>
          ) : (
            <>
              <div className="mt-4 overflow-hidden rounded-2xl bg-ink/5">
                <video
                  ref={videoRef} playsInline muted
                  className="aspect-[3/4] w-full object-cover"
                  style={{ transform: ESPELHO }}
                />
              </div>
              <p className="mt-2 text-center text-[11px] text-muted">
                Rosto inteiro no quadro, boa luz, sem óculos escuros nem chapéu.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
                <Button icon="check" loading={ocupado} onClick={capturar}>Tirar e enviar</Button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
