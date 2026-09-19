import { motion } from 'motion/react';
import { ArrowRight, CalendarClock, Users, UserSearch } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RadioGroup } from 'radix-ui';
import { REPORT_TYPES, type ReportType } from '../api/types.ts';
import { cn } from '../lib/cn.ts';
import { Button } from './ui/Button.tsx';
import { Card, CardBody } from './ui/Card.tsx';

const TYPE_INFO: Record<ReportType, { label: string; description: string; icon: LucideIcon; extracts: string[] }> = {
  meeting: {
    label: 'Reunião',
    description: 'Discussões de equipe, alinhamentos e status.',
    icon: Users,
    extracts: ['Resumo', 'Decisões', 'Próximos passos'],
  },
  interview: {
    label: 'Entrevista',
    description: 'Conversas de seleção e avaliação de candidatos.',
    icon: UserSearch,
    extracts: ['Perfil', 'Pontos fortes', 'Recomendação'],
  },
  scheduling: {
    label: 'Agendamento',
    description: 'Combinados de data, local e participantes.',
    icon: CalendarClock,
    extracts: ['Data e hora', 'Participantes', 'Pendências'],
  },
};

type Props = {
  value: ReportType;
  onChange: (value: ReportType) => void;
  onStart: () => void;
  busy: boolean;
};

export function ReportTypePicker({ value, onChange, onStart, busy }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-[0.16em] uppercase text-accent">Nova sessão</p>
        <h1 className="font-display text-3xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-4xl">
          Ouça, transcreva e <span className="text-gradient">gere o relatório</span>
        </h1>
        <p className="max-w-lg text-muted text-pretty">
          A transcrição acontece ao vivo no seu navegador. O relatório estruturado é montado só no
          fechamento da sessão.
        </p>
      </div>

      <RadioGroup.Root
        value={value}
        onValueChange={(next) => onChange(next as ReportType)}
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Tipo de sessão"
        loop
      >
        {REPORT_TYPES.map((type) => {
          const info = TYPE_INFO[type];
          const Icon = info.icon;
          const selected = value === type;

          return (
            <RadioGroup.Item
              key={type}
              value={type}
              className={cn(
                'group relative flex flex-col items-start gap-3 rounded-card p-4 text-left',
                'glass transition-colors duration-200 hover:border-line-strong',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                selected && 'border-transparent',
              )}
            >
              {selected ? (
                <motion.span
                  layoutId="type-highlight"
                  aria-hidden
                  className="absolute inset-0 rounded-card bg-accent-soft ring-1 ring-inset ring-[color-mix(in_oklch,var(--accent)_45%,transparent)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                />
              ) : null}

              <span
                className={cn(
                  'relative grid size-10 place-items-center rounded-xl transition-colors duration-200',
                  selected ? 'bg-accent text-accent-ink' : 'bg-surface-raised text-muted group-hover:text-ink',
                )}
              >
                <Icon aria-hidden className="size-5" />
              </span>

              <span className="relative flex flex-col gap-1">
                <span className="font-display font-semibold tracking-tight">{info.label}</span>
                <span className="text-sm text-muted text-pretty">{info.description}</span>
              </span>

              <span className="relative mt-auto flex flex-wrap gap-1 pt-1">
                {info.extracts.map((item) => (
                  <span
                    key={item}
                    className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] text-faint ring-1 ring-inset ring-line"
                  >
                    {item}
                  </span>
                ))}
              </span>
            </RadioGroup.Item>
          );
        })}
      </RadioGroup.Root>

      <Card>
        <CardBody className="flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted text-pretty">
            Mantenha esta aba aberta durante a sessão — a tela fica acesa enquanto grava.
          </p>
          <Button size="lg" onClick={onStart} loading={busy} icon={busy ? undefined : <ArrowRight className="size-4" />}>
            {busy ? 'Criando sessão' : 'Iniciar sessão'}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
