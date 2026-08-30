import { useEffect, useMemo, useState } from 'react';
import { cx, initials, seededRandom } from '../services/utils';
import { veilBlur } from '../services/conversation';
import { nivelDoReveal, resolveImage } from '../services/media';
import { Icon } from './ui/Icon';

// ---------------------------------------------------------------------------
// Retrato com Véu — o componente que carrega o diferencial nº 1 do CONEXÃO.
// A foto começa velada e o desfoque só diminui conforme a conversa evolui.
// Sem foto enviada, geramos um retrato abstrato determinístico (mesma pessoa =
// mesma imagem, sempre), para que a descoberta nunca dependa de aparência.
// ---------------------------------------------------------------------------

function GenerativePortrait({ seed }: { seed: string }) {
  const art = useMemo(() => {
    const rnd = seededRandom(seed);
    const h1 = Math.floor(rnd() * 360);
    const h2 = (h1 + 40 + Math.floor(rnd() * 90)) % 360;
    const blobs = Array.from({ length: 3 }, () => ({
      cx: 20 + rnd() * 60, cy: 20 + rnd() * 60,
      r: 12 + rnd() * 26, o: 0.16 + rnd() * 0.28,
      h: rnd() > 0.5 ? h1 : h2,
    }));
    return {
      h1, h2, blobs,
      headX: 42 + rnd() * 16,
      headY: 34 + rnd() * 8,
      headR: 15 + rnd() * 4,
      shoulderW: 46 + rnd() * 16,
    };
  }, [seed]);

  const id = `g-${Math.abs(art.h1 * 31 + art.h2)}`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${art.h1} 52% 74%)`} />
          <stop offset="100%" stopColor={`hsl(${art.h2} 46% 52%)`} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
      {art.blobs.map((b, i) => (
        <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill={`hsl(${b.h} 60% 88%)`} opacity={b.o} />
      ))}
      <ellipse cx={art.headX} cy={art.headY} rx={art.headR} ry={art.headR * 1.18} fill={`hsl(${art.h2} 38% 30%)`} opacity="0.42" />
      <path
        d={`M ${art.headX - art.shoulderW / 2} 100 Q ${art.headX} ${58} ${art.headX + art.shoulderW / 2} 100 Z`}
        fill={`hsl(${art.h2} 38% 30%)`} opacity="0.42"
      />
    </svg>
  );
}

/**
 * No modo demo `photo` é um dataURL. No modo online é um caminho dentro do
 * bucket privado, que precisa virar URL assinada de curta duração.
 */
export function useFotoResolvida(photo?: string, reveal = 1): string | undefined {
  const direta = photo && (photo.startsWith('data:') || photo.startsWith('http')) ? photo : undefined;
  // O nível pedido ao servidor muda em degraus, não continuamente: assim o
  // efeito não refaz a URL assinada a cada centésimo de reveal.
  const nivel = nivelDoReveal(reveal);
  const [url, setUrl] = useState<string | undefined>(direta);
  useEffect(() => {
    let vivo = true;
    if (direta) { setUrl(direta); return; }
    if (!photo) { setUrl(undefined); return; }
    resolveImage(photo, reveal).then((u) => { if (vivo) setUrl(u); }).catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, direta, nivel]);
  return url;
}

export function Portrait({
  seed, photo, name, reveal = 1, className, rounded = 'rounded-xl3', showLock = false, stageLabel,
}: {
  seed: string; photo?: string; name: string; reveal?: number;
  className?: string; rounded?: string; showLock?: boolean; stageLabel?: string;
}) {
  const src = useFotoResolvida(photo, reveal);
  const blur = veilBlur(reveal);
  const veiled = reveal < 0.995;
  return (
    <div className={cx('relative overflow-hidden bg-brandSoft grain', rounded, className)}>
      <div
        className="h-full w-full transition-[filter,transform] duration-1000"
        style={{
          filter: veiled ? `blur(${blur}px) saturate(${0.55 + reveal * 0.45})` : undefined,
          transform: veiled ? `scale(${1 + (1 - reveal) * 0.14})` : undefined,
        }}
      >
        {src
          ? <img src={src} alt={veiled ? `Retrato velado de ${name}` : name} className="h-full w-full object-cover" />
          : <GenerativePortrait seed={seed} />}
      </div>

      {!src && !veiled && (
        <span className="absolute inset-0 grid place-items-center font-display text-3xl font-semibold text-white/90 drop-shadow">
          {initials(name)}
        </span>
      )}

      {veiled && showLock && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-ink/70 to-transparent px-3 pb-2.5 pt-8 text-white">
          <Icon name="lock" size={14} />
          <span className="text-[11px] font-semibold tracking-wide">{stageLabel ?? 'Velado'}</span>
          <span className="ml-auto text-[11px] tabular-nums opacity-80">{Math.round(reveal * 100)}%</span>
        </div>
      )}
    </div>
  );
}

/** Avatar circular pequeno — usado em listas e cabeçalhos. */
export function Avatar({ seed, photo, name, reveal = 1, size = 44, ring }: {
  seed: string; photo?: string; name: string; reveal?: number; size?: number; ring?: boolean;
}) {
  return (
    <div
      className={cx('shrink-0 overflow-hidden rounded-full', ring && 'ring-2 ring-brand ring-offset-2 ring-offset-surface')}
      style={{ width: size, height: size }}
    >
      <Portrait seed={seed} photo={photo} name={name} reveal={reveal} rounded="rounded-full" className="h-full w-full" />
    </div>
  );
}

/** Imagem enviada numa conversa. Resolve o caminho do Storage antes de exibir. */
export function ImagemDaMensagem({ caminho }: { caminho: string }) {
  const src = useFotoResolvida(caminho);
  if (!src) {
    return <div className="mb-2 h-40 w-56 animate-pulseSoft rounded-xl2 bg-line" aria-label="Carregando imagem" />;
  }
  return <img src={src} alt="Imagem enviada" className="mb-2 max-h-64 rounded-xl2 object-cover" />;
}
