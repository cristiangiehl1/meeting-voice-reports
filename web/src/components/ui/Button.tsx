import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn.ts';

const button = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-full font-medium tracking-tight',
    'transition-[transform,background-color,border-color,box-shadow,opacity] duration-200 ease-out',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
    // Alvo de toque mínimo recomendado em mobile — vale para todos os tamanhos.
    'min-h-11',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-accent text-accent-ink border border-transparent',
          'shadow-[0_10px_30px_-12px_var(--accent)]',
          'hover:brightness-110 hover:shadow-[0_14px_36px_-12px_var(--accent)]',
        ],
        secondary: ['glass text-ink hover:border-line-strong hover:bg-surface-raised'],
        ghost: ['border border-transparent text-muted hover:text-ink hover:bg-surface'],
        danger: [
          'border border-transparent text-ink',
          'bg-[color-mix(in_oklch,var(--danger)_18%,transparent)]',
          'ring-1 ring-inset ring-[color-mix(in_oklch,var(--danger)_45%,transparent)]',
          'hover:bg-[color-mix(in_oklch,var(--danger)_28%,transparent)]',
        ],
      },
      size: {
        sm: 'h-11 px-4 text-sm',
        md: 'h-12 px-5 text-[0.95rem]',
        lg: 'h-14 px-7 text-base',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & {
    loading?: boolean;
    icon?: ReactNode;
  };

export function Button({ className, variant, size, block, loading, icon, children, disabled, ...rest }: Props) {
  return (
    <button
      type="button"
      className={cn(button({ variant, size, block }), className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
