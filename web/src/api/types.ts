import { z } from 'zod';

export const REPORT_TYPES = ['meeting', 'interview', 'scheduling'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const transcriptChunkSchema = z.object({
  text: z.string(),
  speaker: z.string().optional(),
  startMs: z.number(),
  endMs: z.number(),
});

export type TranscriptChunkView = z.infer<typeof transcriptChunkSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  reportType: z.enum(REPORT_TYPES),
  chunks: z.array(transcriptChunkSchema),
  createdAt: z.string(),
  finalizedAt: z.string().optional(),
});

export type SessionView = z.infer<typeof sessionSchema>;

export const storedReportSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  reportType: z.enum(REPORT_TYPES),
  data: z.unknown(),
  createdAt: z.string(),
});

export type StoredReportView = z.infer<typeof storedReportSchema>;
