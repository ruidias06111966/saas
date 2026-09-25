import type { ConversationHealth } from '../types';
import { ETAPAS_DA_CONVERSA } from '../constants';
import { Bar, Card, Icon } from './ui';
import { cx } from '../services/utils';

// ---------------------------------------------------------------------------
// Termômetro de Conversa — mede a troca, não o volume.
//
// Antes ele tinha uma segunda função: era o que abria o véu da foto. Essa
// parte morreu no pivô, e com razão — num negócio ninguém quer ver a cara da
// outra pessoa aparecendo aos poucos. O que ficou é o que sempre foi útil:
// mostrar, sem enfeite, se a conversa está andando ou se alguém está falando
// sozinho. Deliberadamente transparente: a pessoa vê o que está sendo medido.
// ---------------------------------------------------------------------------

const METRICS: { key: keyof ConversationHealth; label: string; help: string }[] = [
  { key: 'reciprocity', label: 'Reciprocidade', help: 'Os dois falam de forma equilibrada?' },
  { key: 'depth', label: 'Profundidade', help: 'Respostas com conteúdo e perguntas de volta.' },
  { key: 'consistency', label: 'Constância', help: 'Respostas dentro de um tempo razoável.' },
  { key: 'openness', label: 'Abertura', help: 'Perguntas mais francas aceitas dos dois lados.' },
];

export function ConversationThermometer({ health, compact }: { health: ConversationHealth; compact?: boolean }) {
  const tone = health.score >= 70 ? 'sage' : health.score >= 40 ? 'brand' : 'ember';

  if (compact) {
    return (
      <div className="flex items-center gap-2.5">
        <Icon name="thermometer" size={15} className={cx(tone === 'sage' ? 'text-sage' : tone === 'brand' ? 'text-brand' : 'text-ember')} />
        <Bar value={health.score} tone={tone} className="w-24" />
        <span className="text-[11px] font-semibold tabular-nums text-muted">{health.stageLabel}</span>
      </div>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Icon name="thermometer" size={18} className="text-brand" /> Termômetro da conversa
          </h3>
          <p className="mt-0.5 text-[13px] text-muted">
            {health.messages} mensagens · {health.days} dia{health.days > 1 ? 's' : ''}
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-semibold">{health.score}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted">de 100</div>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {METRICS.map((m) => (
          <div key={m.key}>
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-medium">{m.label}</span>
              <span className="text-[11px] tabular-nums text-muted">{health[m.key] as number}%</span>
            </div>
            <Bar value={health[m.key] as number} tone={tone} className="mt-1" />
            <p className="mt-0.5 text-[11px] text-muted">{m.help}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl bg-brandSoft/60 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Próximo passo</p>
        <p className="mt-1 text-[13px] leading-relaxed">{health.nextGoal}</p>
      </div>
    </Card>
  );
}

/**
 * Em que pé está a conversa.
 *
 * Era a `VeilProgress`, a barra que mostrava quanto da foto já tinha sido
 * revelado e oferecia o botão de "revelar antes do tempo". Sem véu, o que
 * sobra é o degrau: primeiro contato, conversando, entendendo, alinhando,
 * pronto para fechar. Serve para a pessoa saber se já pode falar de preço.
 */
export function EtapasDaConversa({ health }: { health: ConversationHealth }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon name="handshake" size={15} className="text-brand" />
          {health.stageLabel}
        </p>
        <span className="text-[11px] tabular-nums text-muted">
          etapa {health.stage + 1} de {ETAPAS_DA_CONVERSA.length}
        </span>
      </div>

      <div className="flex gap-1">
        {ETAPAS_DA_CONVERSA.map((etapa, i) => (
          <div
            key={etapa.label}
            className={cx(
              'h-1.5 flex-1 rounded-full transition-colors duration-700',
              i <= health.stage ? 'bg-brand' : 'bg-line',
            )}
            title={etapa.label}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        {ETAPAS_DA_CONVERSA[health.stage].note}
      </p>
    </div>
  );
}
