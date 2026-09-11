import type { ReportType } from '../../schemas/index.ts';
import * as meetingReport from './meetingReport.ts';
import * as interviewReport from './interviewReport.ts';
import * as schedulingReport from './schedulingReport.ts';

const promptModuleByType: Record<ReportType, typeof meetingReport> = {
  meeting: meetingReport,
  interview: interviewReport,
  scheduling: schedulingReport,
};

export function buildGenerateReportPrompt(reportType: ReportType, transcript: string) {
  const { getSystemPrompt, getUserPromptTemplate } = promptModuleByType[reportType];

  return {
    systemPrompt: getSystemPrompt(),
    userPrompt: getUserPromptTemplate(transcript),
  };
}
