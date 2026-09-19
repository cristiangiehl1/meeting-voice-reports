/**
 * Cada resultado final da Web Speech API chega como um fragmento solto e sem
 * pontuação — "top", "vai gravando", "que foi". Emendar tudo com '\n' entregava ao
 * LLM uma lista de pedaços em vez de uma conversa, enquanto os few-shot dos prompts
 * em `prompts/v1/` usam prosa corrida. Aqui os fragmentos viram parágrafos.
 *
 * Espelhado em `web/src/lib/transcriptFlow.ts`, que agrupa a mesma coisa para exibir
 * na tela — os dois precisam mudar juntos.
 */

export type FlowChunk = {
  text: string;
  speaker?: string;
  startMs: number;
  endMs: number;
};

/** Silêncio a partir do qual o assunto provavelmente virou outro. */
export const PARAGRAPH_GAP_MS = 3000;

const ENDS_WITH_PUNCTUATION = /[.,;:!?…]$/;

/** O reconhecimento às vezes já devolve pontuação; só completar quando falta. A
 *  caixa do texto fica como veio — corrigir maiúscula aqui estragaria siglas e
 *  nomes próprios, e o LLM lida bem com isso. */
function asSentence(text: string): string {
  return ENDS_WITH_PUNCTUATION.test(text) ? text : `${text}.`;
}

export function groupIntoParagraphs(chunks: FlowChunk[], gapMs: number = PARAGRAPH_GAP_MS): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let previous: FlowChunk | null = null;

  const flush = () => {
    if (current.length > 0) {
      paragraphs.push(current.join(' '));
      current = [];
    }
  };

  for (const chunk of chunks) {
    const text = chunk.text.trim();
    if (!text) continue;

    if (previous !== null) {
      const speakerChanged = chunk.speaker !== previous.speaker;
      // Sem marcação de tempo (startMs/endMs zerados) a diferença dá 0 e nunca
      // quebra: o fallback é um parágrafo único, não uma linha por trecho.
      const paused = chunk.startMs - previous.endMs >= gapMs;
      if (speakerChanged || paused) flush();
    }

    if (current.length === 0 && chunk.speaker) current.push(`${chunk.speaker}:`);
    current.push(asSentence(text));
    previous = chunk;
  }

  flush();
  return paragraphs;
}

export function buildFlowingTranscript(chunks: FlowChunk[], gapMs: number = PARAGRAPH_GAP_MS): string {
  return groupIntoParagraphs(chunks, gapMs).join('\n\n');
}
