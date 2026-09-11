import { OpenRouterService } from '../services/openRouterService.ts';
import { buildReportGraph } from './graph.ts';

export function buildGraph() {
  const llmClient = new OpenRouterService();
  return buildReportGraph(llmClient);
}
