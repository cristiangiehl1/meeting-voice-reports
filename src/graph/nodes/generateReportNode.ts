import type { GraphState } from '../graph.ts';
import type { OpenRouterService } from '../../services/openRouterService.ts';
import { reportSchemaFor } from '../../schemas/index.ts';
import { buildGenerateReportPrompt } from '../../prompts/v1/index.ts';

export function createGenerateReportNode(llmClient: OpenRouterService) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    console.log(`📝 Gerando relatório do tipo "${state.reportType}"...`);

    const schema = reportSchemaFor[state.reportType];
    const { systemPrompt, userPrompt } = buildGenerateReportPrompt(state.reportType, state.transcript);

    const result = await llmClient.generateStructured(systemPrompt, userPrompt, schema);

    if (!result.success) {
      console.log(`❌ Falha ao gerar relatório: ${result.error}`);
      return { error: result.error };
    }

    console.log(`✅ Relatório gerado com sucesso`);
    return { report: result.data };
  };
}
