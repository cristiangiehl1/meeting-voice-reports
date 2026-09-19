import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.ts';

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tracking-tight ring-1 ring-inset',
  {
    variants: {
      tone: {
        neutral: 'bg-surface text-muted ring-line',
        accent: 'bg-accent-soft text-accent ring-[color-mix(in_oklch,var(--accent)_35%,transparent)]',
        success:
          'bg-[color-mix(in_oklch,var(--success)_14%,transparent)] text-success ring-[color-mix(in_oklch,var(--success)_35%,transparent)]',
        warning:
          'bg-[color-mix(in_oklch,var(--warning)_14%,transparent)] text-warning ring-[color-mix(in_oklch,var(--warning)_35%,transparent)]',
        danger:
          'bg-[color-mix(in_oklch,var(--danger)_14%,transparent)] text-danger ring-[color-mix(in_oklch,var(--danger)_35%,transparent)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

type Props = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>;

export function Badge({ className, tone, children, ...rest }: Props) {
  return (
    <span className={cn(badge({ tone }), className)} {...rest}>
      {children}
    </span>
  );
}
