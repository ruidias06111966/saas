import type { User } from '../types';
import { GOAL_EMOJI, GOAL_LABEL } from '../constants';
import { INTEREST_MAP } from '../data/interests';
import { PROFILE_PROMPT_MAP } from '../data/prompts';
import { distanceBand, firstName } from '../services/utils';
import { Button, Card, Chip, Icon } from './ui';
import { Portrait } from './Portrait';

// ---------------------------------------------------------------------------
// Cartão de Essência — a unidade da descoberta.
// A foto entra velada e pequena. O que ocupa o centro é o que a pessoa DISSE.
// ---------------------------------------------------------------------------

export function CompatBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const tone = score >= 85 ? 'text-sage' : score >= 70 ? 'text-brand' : score >= 55 ? 'text-ember' : 'text-muted';
  return (
    <div className={`flex items-baseline gap-1 font-display font-semibold ${tone} ${size === 'sm' ? 'text-sm' : 'text-2xl'}`}>
      {score}
      <span className={size === 'sm' ? 'text-[10px]' : 'text-xs'}>%</span>
    </div>
  );
}

export function EssenceCard({
  user, score, shared, headline, distanceKm, onInterest, onPass, onOpen, highlight, compact,
}: {
  user: User; score: number; shared: string[]; headline: string; distanceKm: number;
  onInterest?: () => void; onPass?: () => void; onOpen?: () => void;
  highlight?: boolean; compact?: boolean;
}) {
  const answer = user.answers.find((a) => a.answer.trim().length > 30) ?? user.answers[0];
  const prompt = answer ? PROFILE_PROMPT_MAP[answer.promptId] : undefined;

  return (
    <Card className={`overflow-hidden animate-floatIn ${highlight ? 'border-brand/40 shadow-lift' : ''}`}>
      {highlight && (
        <div className="flex items-center gap-2 bg-gradient-to-r from-brand to-ember px-5 py-2 text-white">
          <Icon name="sparkle" size={15} filled />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Encontro do dia</span>
          <span className="ml-auto text-[11px] opacity-90">expira em 24 h</span>
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start gap-4">
          <button type="button" onClick={onOpen} className="shrink-0" aria-label={`Ver perfil de ${firstName(user.name)}`}>
            <Portrait
              seed={user.id} photo={user.photo} name={user.name} reveal={0.14}
              className="h-[74px] w-[74px]" rounded="rounded-2xl"
            />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-display text-lg font-semibold leading-tight">
                  {firstName(user.name)}, {user.age}
                  {user.verified && <Icon name="check" size={13} className="ml-1.5 inline text-sage" />}
                </h3>
                <p className="mt-0.5 truncate text-[13px] text-muted">
                  {user.city} · {distanceBand(distanceKm)}
                </p>
              </div>
              <div className="text-right">
                <CompatBadge score={score} />
                <p className="text-[10px] uppercase tracking-wide text-muted">compatível</p>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip size="sm" tone="brand">{GOAL_EMOJI[user.goal]} {GOAL_LABEL[user.goal]}</Chip>
              {user.profession && <Chip size="sm">{user.profession}</Chip>}
            </div>
          </div>
        </div>

        {answer && prompt && (
          <blockquote className="mt-4 rounded-2xl bg-brandSoft/50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">{prompt.label}</p>
            <p className="mt-1.5 font-display text-[15px] leading-relaxed text-ink">“{answer.answer}”</p>
          </blockquote>
        )}

        {!compact && (
          <>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">{headline}</p>
            {shared.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Em comum ({shared.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {shared.slice(0, 4).map((id) => (
                    <Chip key={id} size="sm" tone="sage">
                      {INTEREST_MAP[id]?.emoji} {INTEREST_MAP[id]?.label ?? id}
                    </Chip>
                  ))}
                  {shared.length > 4 && <Chip size="sm">+{shared.length - 4}</Chip>}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-5 flex items-center gap-2">
          {onPass && <Button variant="ghost" size="sm" onClick={onPass}>Passar</Button>}
          {onOpen && <Button variant="outline" size="sm" onClick={onOpen}>Ver perfil</Button>}
          {onInterest && (
            <Button size="sm" icon="heart" className="ml-auto" onClick={onInterest}>
              Tenho interesse
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
