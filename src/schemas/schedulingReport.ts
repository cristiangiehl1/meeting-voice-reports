import { z } from 'zod';

export const SchedulingReportSchema = z.object({
  tipoEvento: z.string().describe('Tipo do evento combinado (ex: reunião, entrevista, consulta, ligação)'),
  dataHora: z
    .string()
    .describe('Data e hora combinadas, exatamente como mencionadas na conversa; string vazia se não houve acordo'),
  participantes: z.array(z.string()).describe('Nomes de todos os envolvidos no evento combinado'),
  localOuLink: z
    .string()
    .nullable()
    .describe('Local físico ou link da chamada mencionado; null se não foi dito'),
  assunto: z.string().describe('Motivo/assunto do evento, resumido em poucas palavras'),
  statusConfirmacao: z
    .enum(['confirmado', 'tentativo', 'nao_confirmado'])
    .describe(
      '"confirmado" só se todas as partes concordaram explicitamente com data/hora; ' +
        '"tentativo" se uma data/hora foi proposta mas depende de confirmação de alguém; ' +
        '"nao_confirmado" se nenhuma data/hora específica foi acordada',
    ),
});

export type SchedulingReport = z.infer<typeof SchedulingReportSchema>;
