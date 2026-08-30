import { useState } from 'react';
import { Banner, Button, Card, Icon } from './ui';
import { aiEnabled } from '../services/geminiService';
import { useApp } from '../state/AppContext';
import { cx } from '../services/utils';

// ---------------------------------------------------------------------------
// Copiloto — a IA sugere, a pessoa decide. Nada é enviado automaticamente.
// ---------------------------------------------------------------------------

export function CopilotPanel({
  title, description, suggestions, loading, onGenerate, onUse, generateLabel = 'Gerar sugestões', compact,
}: {
  title: string; description?: string; suggestions: string[]; loading: boolean;
  onGenerate: () => void; onUse?: (text: string) => void; generateLabel?: string; compact?: boolean;
}) {
  const { canUseAi } = useApp();
  const [copied, setCopied] = useState<string | null>(null);

  const use = (s: string) => {
    onUse?.(s);
    setCopied(s);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Card className={cx('p-5', compact && 'p-4')}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-ember text-white">
          <Icon name="sparkle" size={17} filled />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>}
        </div>
      </div>

      {!aiEnabled && (
        <p className="mt-3 rounded-xl2 bg-bg px-3 py-2 text-[11px] leading-relaxed text-muted">
          Modo local: as sugestões vêm de um banco curado de perguntas. As geradas por IA
          exigem o backend conectado — a chave do modelo fica no servidor, nunca aqui.
        </p>
      )}

      {suggestions.length > 0 && (
        <ul className="mt-4 space-y-2">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button" onClick={() => use(s)} disabled={!onUse}
                className={cx(
                  'w-full rounded-2xl border border-line bg-bg p-3.5 text-left text-[13px] leading-relaxed transition-colors',
                  onUse ? 'hover:border-brand/40 hover:bg-brandSoft/50' : 'cursor-default',
                  copied === s && 'border-sage bg-sage/10',
                )}
              >
                {s}
                {onUse && (
                  <span className="mt-1.5 block text-[11px] font-semibold text-brand">
                    {copied === s ? 'Colocado no campo — edite antes de enviar' : 'Usar como rascunho'}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" variant="secondary" icon="refresh" onClick={onGenerate} loading={loading} disabled={!canUseAi}>
          {suggestions.length ? 'Outra sugestão' : generateLabel}
        </Button>
        {!canUseAi && <span className="text-[11px] text-muted">Limite diário de IA atingido.</span>}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        O Copiloto nunca envia mensagem por você e nunca finge ser você. Tudo passa pela sua revisão.
      </p>
    </Card>
  );
}

export function AiOffNotice() {
  if (aiEnabled) return null;
  return (
    <Banner tone="info" icon="info" title="Copiloto em modo local">
      O app funciona normalmente e as sugestões vêm de heurísticas locais. As geradas por IA
      passam por uma função no servidor, que exige login e guarda a chave do modelo fora do
      navegador.
    </Banner>
  );
}
