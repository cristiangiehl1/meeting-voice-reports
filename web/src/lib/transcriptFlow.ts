import type { TranscriptChunkView } from '../api/types.ts';

/**
 * Agrupa os trechos reconhecidos em parágrafos para exibir a transcrição como
 * conversa, e não como uma lista de fragmentos soltos.
 *
 * Espelha `src/lib/transcriptFlow.ts` do backend, que faz o mesmo agrupamento no
 * texto entregue ao LLM — os dois precisam mudar juntos.
 */

/** Silêncio a partir do qual o assunto provavelmente virou outro. */
export const PARAGRAPH_GAP_MS = 3000;

const ENDS_WITH_PUNCTUATION = /[.,;:!?…]$/;

export type TranscriptParagraph = {
  /** Índice do primeiro trecho do parágrafo — serve de key estável na lista. */
  key: number;
  speaker?: string;
  text: string;
};

function asSentence(text: string): string {
  return ENDS_WITH_PUNCTUATION.test(text) ? text : `${text}.`;
}

export function groupIntoParagraphs(
  chunks: TranscriptChunkView[],
  gapMs: number = PARAGRAPH_GAP_MS,
): TranscriptParagraph[] {
  const paragraphs: TranscriptParagraph[] = [];
  let current: TranscriptParagraph | null = null;
  let previous: TranscriptChunkView | null = null;

  chunks.forEach((chunk, index) => {
    const text = chunk.text.trim();
    if (!text) return;

    if (previous !== null && current !== null) {
      const speakerChanged = chunk.speaker !== previous.speaker;
      // Sem marcação de tempo a diferença dá 0 e nunca quebra — o pior caso é um
      // parágrafo único, nunca a lista de fragmentos de antes.
      const paused = chunk.startMs - previous.endMs >= gapMs;
      if (speakerChanged || paused) current = null;
    }

    if (current === null) {
      current = { key: index, speaker: chunk.speaker, text: asSentence(text) };
      paragraphs.push(current);
    } else {
      current.text = `${current.text} ${asSentence(text)}`;
    }

    previous = chunk;
  });

  return paragraphs;
}
