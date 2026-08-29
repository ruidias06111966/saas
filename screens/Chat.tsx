import { useEffect, useMemo, useRef, useState } from 'react';
import type { Message } from '../types';
import { useApp } from '../state/AppContext';
import { findUser, messagesOf, otherId } from '../state/appState';
import { conversationHealth, nextRitualLevel } from '../services/conversation';
import { blocksSending, CATEGORY_LABEL, moderateText, SAFETY_TIPS } from '../services/moderation';
import { suggestGentleGoodbye, suggestNextQuestion, summarizeAffinities } from '../services/geminiService';
import { LADDER } from '../data/prompts';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Chip, Icon, IconButton, Modal, Textarea } from '../components/ui';
import { ConversationThermometer, VeilProgress } from '../components/ConversationThermometer';
import { CopilotPanel } from '../components/Copilot';
import { ReportDialog } from '../components/ReportDialog';
import { Avatar, Portrait } from '../components/Portrait';
import { readImageAsDataUrl } from '../services/storage';
import { clockTime, cx, dayLabel, firstName, seededRandom, shuffle } from '../services/utils';

// Respostas simuladas: este é um MVP sem backend, e a simulação existe para
// que dê para ver o Termômetro e o Véu evoluindo. Fica claramente rotulada.
const SIMULATED = [
  'Boa pergunta. Deixa eu pensar direito antes de responder qualquer bobagem.',
  'Concordo em quase tudo, menos numa parte — e é justamente a parte interessante.',
  'Isso me lembrou de uma coisa que aconteceu ano passado. Você tem paciência para história longa?',
  'Nunca tinha parado para pensar assim. E você, chegou nessa conclusão como?',
  'Gostei da sua resposta. Me conta uma coisa: isso sempre foi assim ou mudou em algum momento?',
  'Também sou assim. Achei que fosse só eu, sinceramente.',
];

export function Chat({ id }: { id: string }) {
  const {
    me, state, back, navigate, sendMessage, dispatch, toggleFavorite, closeConnection,
    blockUser, setRevealConsent, toast, canUseAi, spendAi,
  } = useApp();

  const [draft, setDraft] = useState('');
  const [pendingRisk, setPendingRisk] = useState<{ text: string; advice: string; categories: string[] } | null>(null);
  const [showCopilot, setShowCopilot] = useState(false);
  const [suggestion, setSuggestion] = useState<string[]>([]);
  const [affinity, setAffinity] = useState('');
  const [loadingAi, setLoadingAi] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [goodbyeOpen, setGoodbyeOpen] = useState(false);
  const [goodbyes, setGoodbyes] = useState<string[]>([]);
  const [farewell, setFarewell] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const conn = state.connections.find((c) => c.id === id);
  const other = conn && me ? findUser(state, otherId(conn, me.id)) : undefined;
  const messages = useMemo(() => (conn ? messagesOf(state, conn.id) : []), [state, conn]);
  const health = useMemo(() => (conn ? conversationHealth(conn, messages) : null), [conn, messages]);

  useEffect(() => {
    if (conn && me) dispatch({ type: 'MARK_READ', connectionId: conn.id, readerId: me.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn?.id, messages.length]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, typing]);

  useEffect(() => {
    if (!me || !other) return;
    let alive = true;
    summarizeAffinities(me, other).then((t) => alive && setAffinity(t));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, other?.id]);

  if (!me || !conn || !other || !health) {
    return (
      <Page title="Conversa indisponível" back={back}>
        <Banner tone="warn" icon="info">Esta conversa não existe mais.</Banner>
      </Page>
    );
  }

  const closed = conn.status === 'encerrada' || conn.status === 'bloqueada';
  const mutualRevealed = !!conn.revealConsent[conn.userA] && !!conn.revealConsent[conn.userB];
  const level = nextRitualLevel(messages);

  const doSend = (text: string, kind: Message['kind'] = 'texto', extra?: Partial<Message>) => {
    const result = sendMessage(conn.id, text, kind, extra);
    if (result && blocksSending(result)) {
      // A mensagem foi registrada e enviada para revisão; avisamos quem enviou.
      toast(result.advice, 'danger');
    }
    setDraft('');
  };

  const trySend = () => {
    const text = draft.trim();
    if (!text) return;
    // Pré-checagem local: conteúdo de risco pede uma confirmação consciente
    // antes de sair do dispositivo.
    const check = moderateText(text);
    if (check.level === 'risco') {
      setPendingRisk({ text, advice: check.advice, categories: check.categories });
      return;
    }
    doSend(text);
  };

  const sendRitual = () => {
    const rnd = seededRandom(`${conn.id}:${messages.length}`);
    const pool = LADDER.filter((q) => q.level === level);
    const question = shuffle(pool, rnd)[0]?.text ?? 'O que fez o seu dia melhor hoje?';
    doSend(question, 'ritual', { ritualLevel: level });
    toast(`Ritual de nível ${level} enviado. Rituais aumentam a "abertura" no termômetro.`, 'ok');
  };

  const simulateReply = () => {
    setTyping(true);
    const rnd = seededRandom(`${conn.id}:${messages.length}:sim`);
    window.setTimeout(() => {
      const text = shuffle(SIMULATED, rnd)[0];
      dispatch({
        type: 'SEND_MESSAGE',
        message: {
          id: `msg_sim_${Date.now()}`, connectionId: conn.id, senderId: other.id,
          kind: 'texto', text, createdAt: new Date().toISOString(),
        },
      });
      setTyping(false);
    }, 1200);
  };

  const genQuestion = async () => {
    if (!canUseAi) return;
    setLoadingAi(true); spendAi();
    const q = await suggestNextQuestion(me, other, messages, level);
    setSuggestion([q]);
    setLoadingAi(false);
  };

  const openGoodbye = async () => {
    setGoodbyeOpen(true);
    if (!goodbyes.length) {
      setLoadingAi(true);
      setGoodbyes(await suggestGentleGoodbye(me, other));
      setLoadingAi(false);
    }
  };

  const grouped: { day: string; items: Message[] }[] = [];
  for (const m of messages) {
    const day = dayLabel(m.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.day === day) last.items.push(m);
    else grouped.push({ day, items: [m] });
  }

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-6xl flex-col lg:h-[calc(100dvh-2.5rem)]">
      {/* Cabeçalho */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <IconButton label="Voltar" name="back" onClick={back} />
        <button type="button" onClick={() => navigate({ name: 'person', id: other.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar seed={other.id} photo={other.photo} name={other.name} reveal={health.reveal} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{firstName(other.name)}</p>
            <p className="truncate text-[11px] text-muted">
              {typing ? <span className="text-brand">digitando…</span> : `${health.stageLabel} · ${Math.round(health.reveal * 100)}% revelado`}
            </p>
          </div>
        </button>
        <IconButton label="Copiloto" name="sparkle" tone="brand" onClick={() => setShowCopilot((v) => !v)} />
        <IconButton label="Opções" name="settings" onClick={() => setMenuOpen(true)} />
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden lg:gap-6 lg:p-6">
        {/* Coluna de mensagens */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 lg:px-0">
            {messages.length === 0 && (
              <Card className="p-5">
                <h3 className="font-display text-lg font-semibold">Vocês se conectaram 🎉</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {affinity || `Comece por algo que ${firstName(other.name)} escreveu no perfil. Aberturas genéricas quase nunca viram conversa.`}
                </p>
                <div className="mt-4">
                  <Button size="sm" variant="secondary" icon="sparkle" onClick={() => setShowCopilot(true)}>
                    Ver sugestões de abertura
                  </Button>
                </div>
              </Card>
            )}

            {grouped.map((g) => (
              <div key={g.day} className="space-y-2">
                <p className="my-4 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">{g.day}</p>
                {g.items.map((m) => {
                  const mine = m.senderId === me.id;
                  const isRitual = m.kind === 'ritual';
                  return (
                    <div key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div className={cx('max-w-[82%] sm:max-w-[70%]')}>
                        {isRitual && (
                          <p className={cx('mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-brand', mine && 'justify-end')}>
                            <Icon name="sparkle" size={11} filled /> Ritual · nível {m.ritualLevel}
                          </p>
                        )}
                        <div
                          className={cx(
                            'rounded-xl3 px-4 py-2.5 text-[14px] leading-relaxed',
                            isRitual
                              ? 'border border-brand/30 bg-brandSoft text-ink'
                              : mine ? 'bg-brand text-white' : 'border border-line bg-surface text-ink',
                          )}
                        >
                          {m.kind === 'imagem' && m.imageData && (
                            <img src={m.imageData} alt="Imagem enviada" className="mb-2 max-h-64 rounded-xl2 object-cover" />
                          )}
                          {m.text}
                        </div>
                        <div className={cx('mt-1 flex items-center gap-1.5 px-1 text-[10px] text-muted', mine && 'justify-end')}>
                          <span>{clockTime(m.createdAt)}</span>
                          {mine && (
                            <span className={m.readAt ? 'text-brand' : ''}>
                              <Icon name="check" size={11} /> {m.readAt ? 'lida' : 'enviada'}
                            </span>
                          )}
                        </div>
                        {m.moderation && m.moderation.level !== 'ok' && (
                          <p className={cx('mt-1 px-1 text-[10px]', mine && 'text-right')}>
                            <Chip size="sm" tone={m.moderation.level === 'risco' ? 'danger' : 'warn'}>
                              <Icon name="shield" size={10} /> em revisão
                            </Chip>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {typing && (
              <div className="flex justify-start">
                <div className="flex gap-1 rounded-xl3 border border-line bg-surface px-4 py-3">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {health.stale && !closed && (
            <div className="shrink-0 px-4 pb-3 pt-3 lg:px-0">
              <Banner
                tone="warn" icon="clock" title="Essa conversa esfriou"
                action={<Button size="sm" variant="outline" onClick={openGoodbye}>Encerrar com gentileza</Button>}
              >
                Mais de cinco dias sem resposta. Sumir é o que todo mundo faz; se despedir é o que a
                gente premia por aqui.
              </Banner>
            </div>
          )}

          {closed ? (
            <div className="shrink-0 border-t border-line bg-surface px-4 py-4 lg:rounded-xl3 lg:border">
              <p className="text-center text-[13px] text-muted">
                {conn.status === 'bloqueada' ? 'Esta pessoa foi bloqueada.' : 'Conversa encerrada.'}{' '}
                {conn.status === 'encerrada' && 'Enviar uma nova mensagem reabre a conversa.'}
              </p>
              {conn.status === 'encerrada' && (
                <div className="mt-3 text-center">
                  <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'SET_CONNECTION', id: conn.id, patch: { status: 'conectada' } })}>
                    Reabrir conversa
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="shrink-0 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:rounded-xl3 lg:border">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" icon="sparkle" onClick={sendRitual}>
                  Ritual nível {level}
                </Button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink">
                  <Icon name="image" size={14} /> Imagem
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try { doSend('📷 Imagem', 'imagem', { imageData: await readImageAsDataUrl(file, 900) }); }
                      catch (err) { toast((err as Error).message, 'danger'); }
                    }}
                  />
                </label>
                <button
                  type="button" onClick={simulateReply}
                  className="ml-auto rounded-full border border-dashed border-line px-3 py-1.5 text-[11px] text-muted hover:text-ink"
                  title="Recurso de demonstração: simula uma resposta para você ver o termômetro e o véu evoluindo."
                >
                  Simular resposta (demo)
                </button>
              </div>

              <div className="flex items-end gap-2">
                <Textarea
                  value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); trySend(); } }}
                  placeholder={`Escreva para ${firstName(other.name)}…`}
                  className="min-h-[46px] flex-1 py-3"
                  rows={1} maxLength={2000}
                />
                <Button icon="send" onClick={trySend} disabled={!draft.trim()} aria-label="Enviar">Enviar</Button>
              </div>
            </div>
          )}
        </div>

        {/* Painel lateral */}
        <aside
          className={cx(
            'w-full shrink-0 space-y-4 overflow-y-auto px-4 pb-6 lg:w-80 lg:px-0',
            showCopilot ? 'block' : 'hidden lg:block',
          )}
        >
          <VeilProgress
            health={health} mutualRevealed={mutualRevealed}
            revealRequested={!!conn.revealConsent[me.id]}
            onReveal={() => setRevealConsent(conn.id, !conn.revealConsent[me.id])}
          />

          {mutualRevealed && (
            <Card className="overflow-hidden p-0">
              <Portrait seed={other.id} photo={other.photo} name={other.name} reveal={1} className="aspect-square w-full" rounded="rounded-none" />
              <p className="p-3 text-center text-[12px] text-muted">Vocês concordaram em revelar as fotos.</p>
            </Card>
          )}

          <ConversationThermometer health={health} />

          <CopilotPanel
            compact title="Próxima pergunta"
            description={affinity || `Sugestões conectadas ao que vocês já falaram. Nível ${level} da escada.`}
            suggestions={suggestion} loading={loadingAi} onGenerate={genQuestion}
            generateLabel="Sugerir pergunta"
            onUse={(t) => setDraft(t)}
          />

          <Banner tone="info" icon="shield" title="Segurança">
            {SAFETY_TIPS[messages.length % SAFETY_TIPS.length]}
          </Banner>
        </aside>
      </div>

      {/* Menu de opções */}
      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={`Conversa com ${firstName(other.name)}`}>
        <div className="space-y-1">
          {[
            { label: 'Ver perfil completo', icon: 'user' as const, onClick: () => { setMenuOpen(false); navigate({ name: 'person', id: other.id }); } },
            { label: conn.favorite[me.id] ? 'Remover dos favoritos' : 'Adicionar aos favoritos', icon: 'star' as const, onClick: () => { toggleFavorite(conn.id); setMenuOpen(false); } },
            { label: 'Encerrar com gentileza', icon: 'handshake' as const, onClick: () => { setMenuOpen(false); openGoodbye(); } },
            { label: 'Desfazer conexão', icon: 'close' as const, onClick: () => { closeConnection(conn.id, false); setMenuOpen(false); } },
            { label: 'Denunciar', icon: 'flag' as const, onClick: () => { setMenuOpen(false); setReporting(true); }, danger: true },
            { label: 'Bloquear', icon: 'block' as const, onClick: () => { blockUser(other.id); setMenuOpen(false); back(); }, danger: true },
          ].map((item) => (
            <button
              key={item.label} type="button" onClick={item.onClick}
              className={cx(
                'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-bg',
                'danger' in item && item.danger ? 'text-danger' : 'text-ink',
              )}
            >
              <Icon name={item.icon} size={18} /> {item.label}
            </button>
          ))}
        </div>
      </Modal>

      {/* Despedida gentil */}
      <Modal
        open={goodbyeOpen} onClose={() => setGoodbyeOpen(false)} title="Encerrar com gentileza"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGoodbyeOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => { closeConnection(conn.id, true, farewell); setGoodbyeOpen(false); back(); }}
              disabled={!farewell.trim()}
            >
              Enviar despedida e encerrar
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">
          Sumir sem avisar é o comportamento mais comum em apps de relacionamento e o que mais machuca.
          Aqui, quem se despede ganha reputação de conversa — e mais alcance na curadoria.
        </p>
        <div className="mt-4 space-y-2">
          {goodbyes.map((g) => (
            <button
              key={g} type="button" onClick={() => setFarewell(g)}
              className={cx(
                'w-full rounded-2xl border p-3 text-left text-[13px] leading-relaxed transition-colors',
                farewell === g ? 'border-brand bg-brandSoft' : 'border-line hover:bg-bg',
              )}
            >
              {g}
            </button>
          ))}
        </div>
        <Textarea
          className="mt-3" value={farewell} onChange={(e) => setFarewell(e.target.value)}
          placeholder="Ou escreva do seu jeito." maxLength={400}
        />
      </Modal>

      {/* Confirmação de conteúdo de risco */}
      <Modal
        open={!!pendingRisk} onClose={() => setPendingRisk(null)} title="Espere um segundo"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingRisk(null)}>Não enviar</Button>
            <Button variant="danger" onClick={() => { if (pendingRisk) doSend(pendingRisk.text); setPendingRisk(null); }}>
              Enviar mesmo assim
            </Button>
          </>
        }
      >
        <Banner tone="danger" icon="shield" title="Conteúdo sinalizado pela moderação">
          {pendingRisk?.advice}
        </Banner>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pendingRisk?.categories.map((c) => (
            <Chip key={c} size="sm" tone="danger">{CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] ?? c}</Chip>
          ))}
        </div>
        <p className="mt-3 rounded-2xl bg-bg p-3 text-[13px] leading-relaxed text-muted">“{pendingRisk?.text}”</p>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Se você enviar, a mensagem vai junto para a fila de revisão humana. Nenhuma conta é banida
          automaticamente, mas conteúdo de risco é analisado.
        </p>
      </Modal>

      <ReportDialog open={reporting} onClose={() => setReporting(false)} target={other} />
    </div>
  );
}
