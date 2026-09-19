import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, ClipboardCopy } from 'lucide-react';
import type { ReportType, StoredReportView } from '../api/types.ts';
import { cn } from '../lib/cn.ts';
import { Badge } from './ui/Badge.tsx';
import { Button } from './ui/Button.tsx';
import { Card, CardBody } from './ui/Card.tsx';

const TYPE_LABELS: Record<ReportType, string> = {
  meeting: 'Reunião',
  interview: 'Entrevista',
  scheduling: 'Agendamento',
};

function labelize(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Achata o relatório em texto pra área de transferência — o `data` é genérico
 *  (varia por reportType), então a serialização também precisa ser genérica. */
function toPlainText(value: unknown, depth = 0): string {
  const pad = '  '.repeat(depth);

  if (isEmpty(value)) return `${pad}—`;
  if (Array.isArray(value)) return value.map((item) => `${pad}- ${toPlainText(item, depth + 1).trimStart()}`).join('\n');
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, nested]) =>
        isRecord(nested) || Array.isArray(nested)
          ? `${pad}${labelize(key)}:\n${toPlainText(nested, depth + 1)}`
          : `${pad}${labelize(key)}: ${toPlainText(nested, depth).trimStart()}`,
      )
      .join('\n');
  }

  return `${pad}${String(value)}`;
}

function Empty() {
  return <span className="text-faint">—</span>;
}

function Value({ value, depth }: { value: unknown; depth: number }) {
  if (isEmpty(value)) return <Empty />;

  if (Array.isArray(value)) {
    return (
      <ul className="flex flex-col gap-2">
        {value.map((item, index) => (
          <li key={index} className={cn('flex gap-2.5', isRecord(item) && 'flex-col gap-0')}>
            {isRecord(item) ? (
              <div className="rounded-xl bg-canvas-deep/30 p-3 ring-1 ring-inset ring-line">
                <Fields data={item} depth={depth + 1} />
              </div>
            ) : (
              <>
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent/50" />
                <span className="text-pretty">{String(item)}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (isRecord(value)) {
    return (
      <div className="rounded-xl bg-canvas-deep/30 p-3 ring-1 ring-inset ring-line">
        <Fields data={value} depth={depth + 1} />
      </div>
    );
  }

  return <span className="text-pretty">{String(value)}</span>;
}

function Fields({ data, depth }: { data: Record<string, unknown>; depth: number }) {
  return (
    <dl className={cn('grid gap-4', depth > 0 && 'gap-3')}>
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex flex-col gap-1.5">
          <dt
            className={cn(
              'font-medium tracking-[0.12em] uppercase',
              depth === 0 ? 'text-xs text-accent' : 'text-[11px] text-faint',
            )}
          >
            {labelize(key)}
          </dt>
          <dd className="m-0 text-[0.95rem] leading-relaxed">
            <Value value={value} depth={depth} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

type Props = {
  report: StoredReportView;
};

export function ReportView({ report }: Props) {
  const [copied, setCopied] = useState(false);
  const data = (isRecord(report.data) ? report.data : {}) as Record<string, unknown>;
  const entries = Object.entries(data);
  const createdAt = new Date(report.createdAt);

  async function handleCopy() {
    await navigator.clipboard.writeText(toPlainText(data));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{TYPE_LABELS[report.reportType]}</Badge>
            <Badge>
              {createdAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </Badge>
          </div>
          <h1 className="font-display text-3xl leading-[1.1] font-semibold tracking-tight">
            Relatório <span className="text-gradient">gerado</span>
          </h1>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleCopy()}
          icon={copied ? <Check className="size-4 text-success" /> : <ClipboardCopy className="size-4" />}
        >
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>

      <motion.div
        className="flex flex-col gap-3"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
      >
        {entries.map(([key, value]) => (
          <motion.div
            key={key}
            variants={{
              hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
              visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
            }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card>
              <CardBody className="gap-3">
                <h2 className="text-xs font-medium tracking-[0.14em] uppercase text-accent">{labelize(key)}</h2>
                <div className="text-[0.95rem] leading-relaxed">
                  <Value value={value} depth={1} />
                </div>
              </CardBody>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
