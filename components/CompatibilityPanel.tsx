import type { CompatibilityResult } from '../types';
import { INTEREST_MAP } from '../data/interests';
import { Bar, Card, Chip, Icon, Ring } from './ui';

const CONFIDENCE_TEXT = {
  alta: 'Os dois perfis estão bem preenchidos, então esta leitura é razoavelmente sólida.',
  media: 'Faltam informações em um dos perfis — a leitura pode mudar bastante.',
  baixa: 'Perfis ainda incompletos. Trate este número como um palpite fraco.',
} as const;

export function CompatibilityPanel({ result, name }: { result: CompatibilityResult; name: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-5">
        <Ring value={result.score} size={92} sublabel="índice" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold leading-snug">{result.headline}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Confiança <strong className="text-ink">{result.confidence}</strong>. {CONFIDENCE_TEXT[result.confidence]}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {result.dimensions.map((d) => (
          <div key={d.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold">{d.label}</span>
              <span className="text-[11px] tabular-nums text-muted">
                {Math.round(d.score * 100)}% · peso {Math.round(d.weight * 100)}%
              </span>
            </div>
            <Bar value={d.score * 100} tone={d.score >= 0.75 ? 'sage' : d.score >= 0.5 ? 'brand' : 'ember'} />
            <p className="mt-1 text-xs leading-relaxed text-muted">{d.detail}</p>
          </div>
        ))}
      </div>

      {result.sharedInterests.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Interesses em comum com {name}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.sharedInterests.map((id) => (
              <Chip key={id} size="sm" tone="sage">
                {INTEREST_MAP[id]?.emoji} {INTEREST_MAP[id]?.label ?? id}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <p className="mt-5 flex items-start gap-2 rounded-2xl bg-bg p-3 text-xs leading-relaxed text-muted">
        <Icon name="info" size={15} className="mt-0.5 shrink-0" />
        Este índice é uma sugestão de conversa, não uma previsão de relacionamento.
        Pessoas com índice baixo dão certo o tempo todo — e o contrário também acontece.
      </p>
    </Card>
  );
}
