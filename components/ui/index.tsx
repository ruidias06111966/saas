import React, { useEffect, useId, useRef } from 'react';
import { cx } from '../../services/utils';
import { Icon, type IconName } from './Icon';

export { Icon };
export type { IconName };

// ------------------------------- Button -------------------------------------

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  full?: boolean;
  loading?: boolean;
};

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand text-white hover:brightness-110 shadow-soft disabled:bg-brand/40',
  secondary: 'bg-brandSoft text-brand hover:bg-brandSoft/70',
  ghost: 'text-muted hover:bg-brandSoft/60 hover:text-ink',
  outline: 'border border-line text-ink hover:bg-brandSoft/40',
  danger: 'bg-danger text-white hover:brightness-110',
};

const SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-base gap-2.5 py-3.5',
};

export function Button({
  variant = 'primary', size = 'md', icon, full, loading, className, children, disabled, ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-full font-semibold transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant], SIZES[size], full && 'w-full', className,
      )}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ label, name, onClick, className, tone = 'default', size = 20 }: {
  label: string; name: IconName; onClick?: () => void; className?: string;
  tone?: 'default' | 'danger' | 'brand'; size?: number;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label} title={label}
      className={cx(
        'grid h-10 w-10 place-items-center rounded-full transition-colors active:scale-95',
        tone === 'danger' ? 'text-danger hover:bg-danger/10'
          : tone === 'brand' ? 'text-brand hover:bg-brandSoft'
          : 'text-muted hover:bg-brandSoft hover:text-ink',
        className,
      )}
    >
      <Icon name={name} size={size} />
    </button>
  );
}

// -------------------------------- Card --------------------------------------

export function Card({ className, children, as: As = 'div', ...rest }: {
  className?: string; children: React.ReactNode; as?: 'div' | 'section' | 'article';
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <As {...rest} className={cx('rounded-xl3 border border-line bg-surface shadow-soft', className)}>
      {children}
    </As>
  );
}

export function SectionTitle({ children, hint, action }: {
  children: React.ReactNode; hint?: string; action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">{children}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

// -------------------------------- Chip --------------------------------------

export function Chip({ children, active, onClick, tone = 'neutral', size = 'md' }: {
  children: React.ReactNode; active?: boolean; onClick?: () => void;
  tone?: 'neutral' | 'brand' | 'ember' | 'sage' | 'danger' | 'warn'; size?: 'sm' | 'md';
}) {
  const tones = {
    neutral: active ? 'bg-ink text-bg border-ink' : 'border-line text-muted hover:border-ink/30 hover:text-ink',
    brand: active ? 'bg-brand text-white border-brand' : 'border-brand/30 text-brand bg-brandSoft/60',
    ember: 'border-ember/30 bg-ember/10 text-ember',
    sage: 'border-sage/30 bg-sage/10 text-sage',
    danger: 'border-danger/30 bg-danger/10 text-danger',
    warn: 'border-warn/30 bg-warn/10 text-warn',
  } as const;
  const Comp = onClick ? 'button' : 'span';
  return (
    <Comp
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border font-medium transition-all',
        size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs',
        tones[tone], onClick && 'active:scale-95',
      )}
    >
      {children}
    </Comp>
  );
}

// -------------------------------- Campos ------------------------------------

export function Field({ label, hint, error, children, required }: {
  label: string; hint?: string; error?: string; children: React.ReactNode; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1 text-[13px] font-semibold text-ink">
        {label}{required && <span className="text-ember">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-danger">{error}</span>}
    </label>
  );
}

const fieldBase =
  'w-full rounded-2xl border border-line bg-bg px-4 py-3 text-sm text-ink placeholder:text-muted/70 ' +
  'transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => <input ref={ref} {...rest} className={cx(fieldBase, className)} />,
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => <textarea ref={ref} {...rest} className={cx(fieldBase, 'min-h-[96px] resize-y leading-relaxed', className)} />,
);
Textarea.displayName = 'Textarea';

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={cx(fieldBase, 'appearance-none pr-10', className)}>{children}</select>;
}

export function Slider({ value, onChange, left, right, label, hint }: {
  value: number; onChange: (v: number) => void; left: string; right: string; label: string; hint?: string;
}) {
  const id = useId();
  return (
    <div className="py-2">
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] font-semibold">{label}</label>
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
      </div>
      <input
        id={id} type="range" min={0} max={100} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[rgb(var(--c-brand))]"
      />
      <div className="flex justify-between text-[11px] text-muted">
        <span>{left}</span><span>{right}</span>
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-brandSoft/40"
    >
      <span className={cx('mt-0.5 h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors', checked ? 'bg-brand' : 'bg-line')}>
        <span className={cx('block h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>}
      </span>
    </button>
  );
}

export function Checkbox({ checked, onChange, children }: {
  checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <input
        type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-line text-brand focus:ring-brand/30"
      />
      <span className="text-[13px] leading-relaxed text-muted">{children}</span>
    </label>
  );
}

// -------------------------------- Modal -------------------------------------

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref} tabIndex={-1}
        className={cx(
          'relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-t-xl4 bg-surface p-6 shadow-lift animate-floatIn sm:rounded-xl3',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="font-display text-xl font-semibold">{title}</h3>
          <IconButton label="Fechar" name="close" onClick={onClose} />
        </div>
        {children}
        {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

// ------------------------------ Progresso -----------------------------------

export function Bar({ value, tone = 'brand', className }: {
  value: number; tone?: 'brand' | 'sage' | 'ember' | 'warn'; className?: string;
}) {
  const colors = { brand: 'bg-brand', sage: 'bg-sage', ember: 'bg-ember', warn: 'bg-warn' };
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-line', className)}>
      <div className={cx('h-full rounded-full transition-all duration-700', colors[tone])} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Ring({ value, size = 84, label, sublabel }: {
  value: number; size?: number; label?: string; sublabel?: string;
}) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} className="stroke-line" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} strokeWidth={6} fill="none" strokeLinecap="round"
          className="stroke-brand transition-all duration-1000"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(100, value) / 100)}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <div className="font-display text-lg font-semibold">{label ?? `${Math.round(value)}%`}</div>
        {sublabel && <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">{sublabel}</div>}
      </div>
    </div>
  );
}

// -------------------------------- Vazio -------------------------------------

export function Empty({ icon = 'sparkle', title, body, action }: {
  icon?: IconName; title: string; body: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl3 border border-dashed border-line px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-brandSoft text-brand"><Icon name={icon} /></span>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-muted">{body}</p>
      {action}
    </div>
  );
}

// -------------------------------- Tabs --------------------------------------

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <button
          key={t.id} type="button" onClick={() => onChange(t.id)}
          className={cx(
            'shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors',
            value === t.id ? 'bg-ink text-bg' : 'bg-surface text-muted hover:text-ink border border-line',
          )}
        >
          {t.label}
          {typeof t.count === 'number' && t.count > 0 && (
            <span className={cx('ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]', value === t.id ? 'bg-bg/25' : 'bg-brandSoft text-brand')}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Banner({ tone = 'info', icon = 'info', title, children, action }: {
  tone?: 'info' | 'warn' | 'danger' | 'ok'; icon?: IconName;
  title?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  const tones = {
    info: 'border-brand/20 bg-brandSoft/60 text-ink',
    warn: 'border-warn/30 bg-warn/10 text-ink',
    danger: 'border-danger/30 bg-danger/10 text-ink',
    ok: 'border-sage/30 bg-sage/10 text-ink',
  };
  const iconTone = { info: 'text-brand', warn: 'text-warn', danger: 'text-danger', ok: 'text-sage' };
  return (
    <div className={cx('flex items-start gap-3 rounded-2xl border p-4', tones[tone])}>
      <Icon name={icon} size={18} className={cx('mt-0.5 shrink-0', iconTone[tone])} />
      <div className="flex-1 text-[13px] leading-relaxed">
        {title && <p className="mb-0.5 font-semibold">{title}</p>}
        {children}
      </div>
      {action}
    </div>
  );
}
