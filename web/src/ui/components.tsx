import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Category, Contact } from '@shared/types.ts';
import { CATEGORY_LABEL } from '@shared/util.ts';
import { Icon, type IconName } from './Icon.tsx';
import { initials } from '../lib/store.tsx';

/* ---------- buttons ---------- */

type Variant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger' | 'danger-text';
export function Button({ variant = 'filled', icon, children, size, className = '', type = 'button', ...rest }: { variant?: Variant; icon?: IconName; children?: ReactNode; size?: 'sm' | 'lg'; className?: string; type?: 'button' | 'submit'; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean; title?: string; 'aria-label'?: string; 'data-testid'?: string; style?: React.CSSProperties }) {
  return (
    <button type={type} className={`btn btn--${variant} ${icon ? 'btn--icon-leading' : ''} ${size ? `btn--${size}` : ''} ${className}`} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, variant, pressed, className = '', size = 24, ...rest }: { icon: IconName; label: string; variant?: 'filled' | 'tonal'; pressed?: boolean; className?: string; size?: number; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean; 'data-testid'?: string }) {
  return (
    <button type="button" className={`icon-btn ${variant ? `icon-btn--${variant}` : ''} ${className}`} aria-label={label} title={label} aria-pressed={pressed} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Fab({ icon, label, extended, variant, onClick, className = '', ...rest }: { icon: IconName; label: string; extended?: boolean; variant?: 'primary' | 'tertiary'; onClick?: () => void; className?: string; 'data-testid'?: string }) {
  return (
    <button type="button" className={`fab ${extended ? 'fab--extended' : ''} ${variant ? `fab--${variant}` : ''} ${className}`} aria-label={label} title={label} onClick={onClick} {...rest}>
      <Icon name={icon} />
      {extended ? <span>{label}</span> : null}
    </button>
  );
}

/* ---------- chips ---------- */

export function Chip({ selected, onClick, icon, children, category, className = '', small, testId }: { selected?: boolean; onClick?: () => void; icon?: IconName; children: ReactNode; category?: Category; className?: string; small?: boolean; testId?: string }) {
  return (
    <button type="button" className={`chip ${category ? 'chip--cat' : ''} ${small ? 'chip--sm' : ''} ${className}`} data-cat={category} aria-pressed={onClick ? !!selected : undefined} onClick={onClick} data-testid={testId}>
      {category ? <span className={`dot dot--${category}`} /> : icon ? <Icon name={icon} /> : selected ? <Icon name="check" /> : null}
      {children}
    </button>
  );
}

export function CategoryChips({ value, onChange, allowEmpty = true }: { value: Category[]; onChange: (v: Category[]) => void; allowEmpty?: boolean }) {
  const cats: Category[] = ['personal', 'business', 'corporate', 'social'];
  return (
    <div className="chips">
      {cats.map((c) => (
        <Chip
          key={c}
          category={c}
          selected={value.includes(c)}
          testId={`cat-chip-${c}`}
          onClick={() => {
            const next = value.includes(c) ? value.filter((x) => x !== c) : [...value, c];
            if (!next.length && !allowEmpty) return;
            onChange(next);
          }}
        >
          {CATEGORY_LABEL[c]}
        </Chip>
      ))}
    </div>
  );
}

export function CategoryBadges({ categories, small = true }: { categories: Category[]; small?: boolean }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      {categories.map((c) => (
        <span key={c} className={`chip chip--cat ${small ? 'chip--sm' : ''}`} data-cat={c} style={{ cursor: 'default' }}>
          {CATEGORY_LABEL[c]}
        </span>
      ))}
    </span>
  );
}

/* ---------- avatar ---------- */

export function Avatar({ contact, name, url, size, category }: { contact?: Pick<Contact, 'displayName' | 'avatarUrl' | 'categories'>; name?: string; url?: string | null; size?: 'sm' | 'lg'; category?: Category }) {
  const n = contact?.displayName ?? name ?? '?';
  const u = contact?.avatarUrl ?? url;
  const cat = category ?? contact?.categories[0];
  const [broken, setBroken] = useState(false);
  return (
    <div className={`avatar ${size ? `avatar--${size}` : ''}`} data-cat={cat} aria-hidden="true">
      {u && !broken ? <img src={u} alt="" onError={() => setBroken(true)} /> : initials(n)}
    </div>
  );
}

/* ---------- fields ---------- */

export function TextField({ label, value, onChange, type = 'text', placeholder, help, error, multiline, required, autoFocus, name, small, disabled, list, testId }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; help?: string; error?: string; multiline?: boolean; required?: boolean; autoFocus?: boolean; name?: string; small?: boolean; disabled?: boolean; list?: string; testId?: string }) {
  const cls = `field__input ${small ? 'field__input--sm' : ''}`;
  return (
    <label className={`field ${error ? 'field--error' : ''}`}>
      <span className="field__label">{label}{required ? ' *' : ''}</span>
      {multiline ? (
        <textarea className={cls} value={value} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)} placeholder={placeholder} name={name} disabled={disabled} data-testid={testId} />
      ) : (
        <input className={cls} type={type} value={value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} placeholder={placeholder} required={required} autoFocus={autoFocus} name={name} disabled={disabled} list={list} data-testid={testId} />
      )}
      {error || help ? <span className="field__help">{error ?? help}</span> : null}
    </label>
  );
}

export function Select({ label, value, onChange, options, small }: { label?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; small?: boolean }) {
  return (
    <label className="field">
      {label ? <span className="field__label">{label}</span> : null}
      <select className={`field__input ${small ? 'field__input--sm' : ''}`} value={value} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)}>
      <span className="switch__track">
        <span className="switch__thumb" />
      </span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Search', small, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; small?: boolean; autoFocus?: boolean }) {
  return (
    <div className={`search ${small ? 'search--sm' : ''}`} role="search">
      <Icon name="search" />
      <input value={value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus} data-testid="search-input" />
      {value ? <IconButton icon="close" label="Clear" onClick={() => onChange('')} /> : null}
    </div>
  );
}

export function SegmentedButtons<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: IconName }[] }) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className="segmented__btn" aria-pressed={o.value === value} onClick={() => onChange(o.value)} data-testid={`segment-${o.value}`}>
          {o.icon ? <Icon name={o.icon} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; icon?: IconName }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" className="tab" aria-selected={t.value === value} onClick={() => onChange(t.value)} data-testid={`tab-${t.value}`}>
          {t.icon ? <Icon name={t.icon} /> : null}
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- overlays ---------- */

export function Dialog({ open, onClose, title, children, actions, wide, testId }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; actions?: ReactNode; wide?: boolean; testId?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={`dialog ${wide ? 'dialog--wide' : ''}`} role="dialog" aria-modal="true" data-testid={testId}>
        <h2 className="headline-sm">{title}</h2>
        <div className="stack">{children}</div>
        {actions ? <div className="dialog__actions">{actions}</div> : null}
      </div>
    </>
  );
}

export function Sheet({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <aside className="sheet" role="complementary" data-testid="sheet">
      <div className="sheet__header">
        <div className="title-lg truncate" style={{ flex: 1 }}>
          {title}
        </div>
        {actions}
        <IconButton icon="close" label="Close" onClick={onClose} />
      </div>
      <div className="sheet__body">{children}</div>
    </aside>
  );
}

export function Menu({ trigger, items, align = 'end', placement = 'bottom' }: { trigger: (open: () => void) => ReactNode; items: { label: string; icon?: IconName; onClick: () => void; danger?: boolean }[]; align?: 'start' | 'end'; placement?: 'bottom' | 'right' | 'top-right' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Position with `fixed` coordinates from the trigger's screen rect, so the menu is never clipped
  // by a scrolling or overflow-hidden ancestor and always stays inside the viewport.
  const place = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const mw = menuRef.current?.offsetWidth ?? 220;
    const mh = menuRef.current?.offsetHeight ?? 120;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    if (placement === 'right' || placement === 'top-right') {
      left = r.right + 8;
      top = placement === 'right' ? r.top : r.bottom - mh;
      if (left + mw > vw - 8) left = Math.max(8, r.left - mw - 8);
    } else {
      left = align === 'end' ? r.right - mw : r.left;
      top = r.bottom + 4;
      if (top + mh > vh - 8) top = Math.max(8, r.top - mh - 4);
    }
    left = Math.min(Math.max(8, left), vw - mw - 8);
    top = Math.min(Math.max(8, top), vh - mh - 8);
    setPos({ position: 'fixed', left, top });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {trigger(() => setOpen((o) => !o))}
      {open ? (
        <div ref={menuRef} className="menu" role="menu" style={pos} data-testid="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="menu__item"
              style={it.danger ? { color: 'var(--md-sys-color-error)' } : undefined}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.icon ? <Icon name={it.icon} /> : null}
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Banner({ kind, icon = 'info', children, action }: { kind?: 'error' | 'tertiary'; icon?: IconName; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner ${kind ? `banner--${kind}` : ''}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} />
      <div style={{ flex: 1 }}>{children}</div>
      {action}
    </div>
  );
}

export function Empty({ icon = 'people', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div className="title-md" style={{ color: 'var(--md-sys-color-on-surface)' }}>
        {title}
      </div>
      {children ? <div className="body-md">{children}</div> : null}
      {action}
    </div>
  );
}

export function Progress({ value }: { value?: number }) {
  return (
    <div className={`progress ${value === undefined ? 'progress--indeterminate' : ''}`} role="progressbar" aria-valuenow={value}>
      <span style={value !== undefined ? { width: `${Math.round(value * 100)}%` } : undefined} />
    </div>
  );
}

export function Spinner({ large }: { large?: boolean }) {
  return <div className={`spinner ${large ? 'spinner--lg' : ''}`} role="status" aria-label="Loading" />;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="empty" data-testid="loading">
      <Spinner large />
      <div className="body-md">{label}</div>
    </div>
  );
}

export function StrengthBar({ value }: { value: number }) {
  return (
    <span className="strength" title={`${Math.round(value * 100)}% strength`}>
      <span style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  );
}

export function Card({ children, title, action, variant, category, className = '', onClick, style, testId }: { children: ReactNode; title?: ReactNode; action?: ReactNode; variant?: 'filled' | 'elevated' | 'outlined'; category?: Category; className?: string; onClick?: () => void; style?: React.CSSProperties; testId?: string }) {
  return (
    <section className={`card ${variant ? `card--${variant}` : ''} ${category ? 'card--cat' : ''} ${onClick ? 'card--clickable' : ''} ${className}`} data-cat={category} onClick={onClick} style={style} data-testid={testId}>
      {title ? (
        <div className="card__title">
          <h3 className="title-md">{title}</h3>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}
