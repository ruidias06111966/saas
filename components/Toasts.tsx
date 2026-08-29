import { useApp } from '../state/AppContext';
import { Icon } from './ui';
import { cx } from '../services/utils';

const TONES = {
  ok: 'border-sage/40 bg-sage text-white',
  info: 'border-brand/40 bg-ink text-bg',
  warn: 'border-warn/40 bg-warn text-white',
  danger: 'border-danger/40 bg-danger text-white',
} as const;

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx('pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-lift animate-floatIn', TONES[t.tone])}
        >
          <p className="flex-1 text-[13px] leading-relaxed">{t.text}</p>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Fechar aviso" className="mt-0.5 opacity-70 hover:opacity-100">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
