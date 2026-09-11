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
    const { text, speaker } = request.body as { text: string; speaker?: string };

    const session = sessionService.appendTranscript(id, {
      text,
      speaker,
      startMs: 0,
      endMs: 0,
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

  app.post('/reports/:id/email', async (request, reply) => {
    const { id } = request.params as { id: string };
    const report = reportService.get(id);

    if (!report) {
      return reply.status(404).send({ error: 'Relatório não encontrado' });
    }

    try {
      const html = buildReportEmailHtml(report.reportType, report.data);
      const subject = buildReportEmailSubject(report.reportType);
      await emailService.sendReportEmail(subject, html);
      return reply.status(200).send({ sent: true });
    } catch (error) {
      request.log.error(error, 'Falha ao enviar email do relatório');
      return reply.status(500).send({
        error: error instanceof Error ? error.message : 'Falha ao enviar email do relatório',
      });
    }
  });

  return app;
};
