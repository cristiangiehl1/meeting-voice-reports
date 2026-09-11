import type { ReportType } from '../schemas/index.ts';

export type StoredReport = {
  id: string;
  sessionId: string;
  reportType: ReportType;
  data: unknown;
  createdAt: string;
};

const reports = new Map<string, StoredReport>();

export class ReportService {
  save(sessionId: string, reportType: ReportType, data: unknown): StoredReport {
    const report: StoredReport = {
      id: crypto.randomUUID(),
      sessionId,
      reportType,
      data,
      createdAt: new Date().toISOString(),
    };
    reports.set(report.id, report);
    return report;
  }

  get(reportId: string): StoredReport | undefined {
    return reports.get(reportId);
  }
}
