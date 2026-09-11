import { StateGraph, START, END, MessagesZodMeta } from '@langchain/langgraph';
import { withLangGraph } from '@langchain/langgraph/zod';
import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { createGenerateReportNode } from './nodes/generateReportNode.ts';
import { REPORT_TYPES } from '../schemas/index.ts';
import type { OpenRouterService } from '../services/openRouterService.ts';

const ReportStateAnnotation = z.object({
  messages: withLangGraph(z.custom<BaseMessage[]>(), MessagesZodMeta).optional(),

  transcript: z.string(),
  reportType: z.enum(REPORT_TYPES),

  report: z.any().optional(),
  error: z.string().optional(),
});

export type GraphState = z.infer<typeof ReportStateAnnotation>;

export function buildReportGraph(llmClient: OpenRouterService) {
  const workflow = new StateGraph({
    stateSchema: ReportStateAnnotation,
  })
    .addNode('generateReport', createGenerateReportNode(llmClient))
    .addEdge(START, 'generateReport')
    .addEdge('generateReport', END);

  return workflow.compile();
}
