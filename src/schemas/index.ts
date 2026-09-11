import { MeetingReportSchema } from './meetingReport.ts';
import { InterviewReportSchema } from './interviewReport.ts';
import { SchedulingReportSchema } from './schedulingReport.ts';

export const REPORT_TYPES = ['meeting', 'interview', 'scheduling'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const reportSchemaFor = {
  meeting: MeetingReportSchema,
  interview: InterviewReportSchema,
  scheduling: SchedulingReportSchema,
} as const;

export * from './meetingReport.ts';
export * from './interviewReport.ts';
export * from './schedulingReport.ts';
