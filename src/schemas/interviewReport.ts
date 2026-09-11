import { z } from 'zod';

export const PerguntaRespostaSchema = z.object({
  pergunta: z.string().describe('Pergunta feita pelo(s) entrevistador(es), como formulada na conversa'),
  resposta: z.string().describe('Resposta dada pelo candidato a essa pergunta'),
});

export const InterviewReportSchema = z.object({
  candidato: z.string().describe('Nome do candidato entrevistado'),
  vaga: z.string().describe('Nome/título da vaga para a qual o candidato está sendo entrevistado'),
  entrevistadores: z.array(z.string()).describe('Nomes das pessoas que conduziram a entrevista'),
  perguntasRespostas: z
    .array(PerguntaRespostaSchema)
    .describe('Pares de pergunta e resposta relevantes trocados durante a entrevista'),
  pontosFortes: z
    .array(z.string())
    .describe('Pontos fortes do candidato observados nas respostas, com base apenas no que foi dito'),
  pontosFracos: z
    .array(z.string())
    .describe('Pontos fracos ou lacunas do candidato observados nas respostas'),
  avaliacaoGeral: z
    .string()
    .describe('Parágrafo corrido com a avaliação geral do desempenho do candidato na entrevista'),
  recomendacao: z
    .enum(['avancar', 'reprovar', 'proxima_etapa'])
    .describe(
      '"avancar" só se um entrevistador expressou intenção clara de aprovar/contratar; ' +
        '"reprovar" só se houve rejeição explícita; "proxima_etapa" quando a conversa não ' +
        'trouxe uma decisão final explícita dos entrevistadores',
    ),
});

export type InterviewReport = z.infer<typeof InterviewReportSchema>;
