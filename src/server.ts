import Fastify from 'fastify';
import cors from '@fastify/cors';

import { buildGraph } from './graph/factory.ts';
import { REPORT_TYPES, type ReportType } from './schemas/index.ts';
import { SessionService } from './services/sessionService.ts';
import { ReportService } from './services/reportService.ts';
import { EmailService, type EmailSender } from './services/emailService.ts';
import { buildReportEmailHtml, buildReportEmailSubject } from './emails/reportEmailTemplate.ts';

export type ServerDeps = {
  sessionService?: SessionService;
  reportService?: ReportService;
  emailService?: EmailSender;
};

export const createServer = (deps: ServerDeps = {}) => {
  const graph = buildGraph();
  const sessionService = deps.sessionService ?? new SessionService();
  const reportService = deps.reportService ?? new ReportService();
  const emailService = deps.emailService ?? new EmailService();

  const app = Fastify();
  app.register(cors, { origin: true });

  app.post(
    '/sessions',
    {
      schema: {
        body: {
          type: 'object',
          required: ['reportType'],
          properties: {
            reportType: { type: 'string', enum: [...REPORT_TYPES] },
          },
        },
      },
    },
    async (request, reply) => {
      const { reportType } = request.body as { reportType: ReportType };
      const session = sessionService.create(reportType);
      return reply.status(201).send(session);
    },
  );

  app.post('/sessions/:id/transcript', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { text, speaker, startMs, endMs } = request.body as {
      text: string;
      speaker?: string;
      startMs?: number;
      endMs?: number;
    };

    // Os tempos são o que permite agrupar o transcript em parágrafos por pausa.
    // Clientes antigos não os mandam: 0/0 degrada para um parágrafo único.
    const session = sessionService.appendTranscript(id, {
      text,
      speaker,
      startMs: startMs ?? 0,
      endMs: endMs ?? 0,
    });

    return reply.status(201).send(session);
  });

  app.post('/sessions/:id/finalize', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const session = sessionService.finalize(id);
      const transcript = sessionService.getFullTranscript(id);

      const result = await graph.invoke({
        transcript,
        reportType: session.reportType,
      });

      if (result.error) {
        return reply.status(422).send({ error: result.error });
      }

      const report = reportService.save(id, session.reportType, result.report);
      return report;
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Erro ao finalizar sessão',
      });
    }
  });

  app.post(
    '/reports/:id/email',
    {
      schema: {
        body: {
          // `null` entra na união porque um POST sem corpo é uma chamada válida:
          // significa "manda só pro destinatário padrão".
          type: ['object', 'null'],
          properties: {
            to: {
              type: 'array',
              minItems: 1,
              maxItems: 10,
              items: {
                type: 'string',
                // Validação de endereço no servidor: o `to` vem do cliente e vira
                // chamada ao provider. Formato pragmático (sem tentar cobrir a RFC),
                // só o bastante pra barrar o que nunca poderia ser entregue.
                pattern: '^[^@\\s,]+@[^@\\s,.]+(\\.[^@\\s,.]+)+$',
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { to } = (request.body ?? {}) as { to?: string[] };
      const report = reportService.get(id);

      if (!report) {
        return reply.status(404).send({ error: 'Relatório não encontrado' });
      }

      try {
        const html = buildReportEmailHtml(report.reportType, report.data);
        const subject = buildReportEmailSubject(report.reportType);
        await emailService.sendReportEmail(subject, html, to);
        return reply.status(200).send({ sent: true });
      } catch (error) {
        request.log.error(error, 'Falha ao enviar email do relatório');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Falha ao enviar email do relatório',
        });
      }
    },
  );

  return app;
};
