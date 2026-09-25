import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import { connectionWith, findUser } from '../state/appState';
import { suggestOpeners } from '../services/geminiService';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Chip, Icon, SectionTitle } from '../components/ui';
import { Portrait } from '../components/Portrait';
import { CopilotPanel } from '../components/Copilot';
import { ReportDialog } from '../components/ReportDialog';
import { distanceBand, firstName, timeAgo } from '../services/utils';
import { type Categoria, listarCategorias } from '../services/mercado';

// ---------------------------------------------------------------------------
// O perfil profissional de outra pessoa.
//
// Saiu tudo o que media afinidade: a pontuação de compatibilidade, o painel de
// dimensões, os interesses em comum, a bússola, o estilo de vida e as respostas
// de prompt. Num mercado de trabalho nada disso importa — importa o que a
// pessoa faz, há quanto tempo, e se ela responde.
//
// O botão também mudou de significado. Antes era "demonstrar interesse", e o
// interesse só virava conversa se fosse recíproco. Continua recíproco, porque
// ninguém deve poder escrever para quem não quer ser abordado, mas o texto
// agora diz o que é: um pedido de conversa sobre trabalho.
// ---------------------------------------------------------------------------

export function PersonProfile({ id }: { id: string }) {
  const { me, state, back, navigate, expressInterest, blockUser, toast, canUseAi, spendAi } = useApp();
  const other = findUser(state, id);
  const [openers, setOpeners] = useState<string[]>([]);
  const [loadingOpeners, setLoadingOpeners] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  useEffect(() => { listarCategorias().then(setCategorias).catch(() => {}); }, []);

  const nomeDaCategoria = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.nome])),
    [categorias],
  );

  if (!me || !other) {
    return (
      <Page title="Perfil indisponível" back={back}>
        <Banner tone="warn" icon="info">Este perfil não existe mais ou foi removido.</Banner>
      </Page>
    );
  }

  const conn = connectionWith(state, me.id, other.id);
  const connected = conn?.status === 'conectada';
  const iAsked = !!conn?.likes[me.id];

  const genOpeners = async () => {
    if (!canUseAi) return;
    setLoadingOpeners(true);
    spendAi();
    setOpeners(await suggestOpeners(me, other));
    setLoadingOpeners(false);
  };

  const pedirConversa = () => {
    const r = expressInterest(other.id);
    if (!r.ok) { toast(r.reason ?? 'Não foi possível enviar o pedido.', 'danger'); return; }
    toast(
      r.connected
        ? 'Vocês já podem conversar.'
        : 'Pedido enviado. A conversa abre quando a outra pessoa aceitar.',
      r.connected ? 'ok' : 'info',
    );
  };

  return (
    <Page back={back} maxWidth="max-w-3xl">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
          <Portrait
            seed={other.id} photo={other.photo} name={other.name}
            className="h-32 w-32 shrink-0 sm:h-40 sm:w-40"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              {other.name}
              {other.verified && <Icon name="check" size={17} className="ml-2 inline text-sage" />}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {other.profession || 'Profissão não informada'} · {other.city}, {other.state}
              {typeof other.distanceKm === 'number' && ` · ${distanceBand(other.distanceKm)}`}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {typeof other.anosExperiencia === 'number' && (
                <Chip size="sm" tone="brand">{other.anosExperiencia} anos de experiência</Chip>
              )}
              <Chip size="sm">{other.atendeRemoto ? 'Atende a distância' : 'Só presencial'}</Chip>
              <Chip size="sm" tone="sage">reputação {other.reputation}</Chip>
            </div>

            <p className="mt-3 text-[11px] text-muted">
              Ativo {timeAgo(other.lastActiveAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line p-5">
          {connected ? (
            <Button icon="chat" onClick={() => conn && navigate({ name: 'chat', id: conn.id })}>
              Abrir conversa
            </Button>
          ) : iAsked ? (
            <Button variant="outline" disabled icon="clock">Pedido enviado</Button>
          ) : (
            <Button icon="chat" onClick={pedirConversa}>Pedir para conversar</Button>
          )}
          <Button variant="ghost" icon="flag" onClick={() => setReporting(true)}>Denunciar</Button>
          <Button
            variant="ghost" icon="block"
            onClick={() => { blockUser(other.id); toast('Pessoa bloqueada.', 'info'); back(); }}
          >
            Bloquear
          </Button>
        </div>
      </Card>

      <section className="mt-6">
        <SectionTitle>Em que atua</SectionTitle>
        <Card className="p-5">
          {other.especialidades.length === 0 ? (
            <p className="text-sm text-muted">Esta pessoa ainda não escolheu áreas de atuação.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {other.especialidades.map((c) => (
                <Chip key={c} size="sm" tone="brand">{nomeDaCategoria.get(c) ?? c}</Chip>
              ))}
            </div>
          )}
        </Card>
      </section>

      {other.bio && (
        <section className="mt-6">
          <SectionTitle>O que ela faz</SectionTitle>
          <Card className="p-5">
            <p className="whitespace-pre-wrap font-display text-[15px] leading-relaxed">{other.bio}</p>
          </Card>
        </section>
      )}

      {!connected && (
        <section className="mt-6">
          <CopilotPanel
            title={`Como abrir conversa com ${firstName(other.name)}`}
            description="Sugestões para você editar antes de enviar. O Copiloto nunca manda nada sozinho."
            suggestions={openers}
            loading={loadingOpeners}
            onGenerate={() => { if (canUseAi) void genOpeners(); }}
            onUse={(t: string) => { void navigator.clipboard?.writeText(t); toast('Copiado.', 'ok'); }}
          />
        </section>
      )}

      <ReportDialog open={reporting} onClose={() => setReporting(false)} target={other} />
    </Page>
  );
}
