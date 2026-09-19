import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.ts';

type Props = HTMLAttributes<HTMLDivElement> & {
  raised?: boolean;
};

export function Card({ className, raised, children, ...rest }: Props) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card hairline-top',
        raised ? 'glass-raised' : 'glass',
        'shadow-[0_24px_60px_-32px_rgb(0_0_0/0.7)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('font-display text-lg font-semibold tracking-tight', className)} {...rest}>
      {children}
    </h2>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col gap-5 p-5 sm:p-6', className)} {...rest}>
      {children}
    </div>
  );
}
