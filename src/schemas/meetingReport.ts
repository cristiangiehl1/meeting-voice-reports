import { z } from 'zod';

export const ActionItemSchema = z.object({
  tarefa: z.string().describe('Descrição da tarefa que alguém se comprometeu a fazer'),
  responsavel: z
    .string()
    .describe('Pessoa ou equipe que assumiu a tarefa; string vazia se ninguém foi indicado'),
  prazo: z
    .string()
    .nullable()
    .describe('Prazo exatamente como mencionado na conversa; null se nenhum prazo foi dito'),
});

export const MeetingReportSchema = z.object({
  titulo: z.string().describe('Assunto/tema central da reunião, resumido em poucas palavras'),
  data: z
    .string()
    .describe('Data da reunião exatamente como mencionada na transcrição; string vazia se não foi dita'),
  participantes: z
    .array(z.string())
    .describe('Nomes de todas as pessoas que falaram ou foram citadas como presentes'),
  pauta: z
    .array(z.string())
    .describe('Tópicos efetivamente discutidos, na ordem em que apareceram na conversa'),
  resumoDiscussao: z
    .string()
    .describe('Parágrafo corrido resumindo o conteúdo da discussão, sem listar item por item'),
  decisoes: z
    .array(z.string())
    .describe('Apenas decisões efetivamente fechadas pelo grupo — não sugestões ou ideias em aberto'),
  itensDeAcao: z
    .array(ActionItemSchema)
    .describe('Tarefas que alguém explicitamente assumiu fazer, com responsável e prazo quando houver'),
  pendencias: z
    .array(z.string())
    .describe('Temas discutidos mas não resolvidos, ou perguntas que ficaram sem resposta'),
});

export type MeetingReport = z.infer<typeof MeetingReportSchema>;
