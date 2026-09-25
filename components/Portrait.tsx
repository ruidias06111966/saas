import { useEffect, useMemo, useState } from 'react';
import { cx, initials, seededRandom } from '../services/utils';
import { resolveImage } from '../services/media';

// ---------------------------------------------------------------------------
// Retrato.
//
// Era o "Retrato com Véu", o diferencial nº 1 do app de relacionamentos: a
// foto começava desfocada e só ia clareando conforme a conversa evoluía.
//
// O véu morreu no pivô, e tinha de morrer. Num mercado de trabalho, esconder a
// cara de quem vai entrar na sua obra, mexer na sua contabilidade ou atender no
// seu balcão é o contrário do que o produto precisa vender, que é confiança.
// Aqui a foto é nítida desde o primeiro segundo.
//
// O que ficou é o retrato generativo: sem foto enviada, geramos uma imagem
// abstrata determinística (mesma pessoa = mesma imagem, sempre), para que um
// perfil sem foto não fique com um buraco cinza.
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
export function useFotoResolvida(photo?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    if (!photo) { setUrl(undefined); return; }
    resolveImage(photo).then((u) => { if (vivo) setUrl(u); }).catch(() => {});
    return () => { vivo = false; };
  }, [photo]);

  return url;
}

export function Portrait({ seed, photo, name, className, rounded = 'rounded-xl3' }: {
  seed: string; photo?: string; name: string; className?: string; rounded?: string;
}) {
  const src = useFotoResolvida(photo);

  return (
    <div className={cx('relative overflow-hidden bg-line', rounded, className)}>
      {src ? (
        <img src={src} alt={`Foto de ${name}`} className="h-full w-full object-cover" />
      ) : (
        <GenerativePortrait seed={seed} />
      )}
      {!src && (
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-display text-2xl font-bold text-white/85 drop-shadow">{initials(name)}</span>
        </div>
      )}
    </div>
  );
}

/** Avatar circular pequeno — usado em listas e cabeçalhos. */
export function Avatar({ seed, photo, name, size = 44, ring }: {
  seed: string; photo?: string; name: string; size?: number; ring?: boolean;
}) {
  return (
    <div
      className={cx('shrink-0 overflow-hidden rounded-full', ring && 'ring-2 ring-brand ring-offset-2 ring-offset-surface')}
      style={{ width: size, height: size }}
    >
      <Portrait seed={seed} photo={photo} name={name} rounded="rounded-full" className="h-full w-full" />
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
