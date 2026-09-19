import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PARAGRAPH_GAP_MS, buildFlowingTranscript } from '../src/lib/transcriptFlow.ts';

const chunk = (text: string, startMs: number, endMs: number, speaker?: string) => ({
  text,
  speaker,
  startMs,
  endMs,
});

describe('buildFlowingTranscript', () => {
  it('emenda trechos seguidos num parágrafo só, pontuando cada fala', () => {
    const transcript = buildFlowingTranscript([
      chunk('agora tá funcionando essa porra', 0, 1500),
      chunk('top', 1600, 2000),
      chunk('vai gravando', 2100, 2800),
    ]);

    assert.equal(transcript, 'agora tá funcionando essa porra. top. vai gravando.');
  });

  it('abre parágrafo novo quando houve pausa longa entre os trechos', () => {
    const transcript = buildFlowingTranscript([
      chunk('vai gravando', 0, 1000),
      chunk('ele traduz o áudio em tempo real', 1000 + PARAGRAPH_GAP_MS, 12000),
    ]);

    assert.equal(transcript, 'vai gravando.\n\nele traduz o áudio em tempo real.');
  });

  it('preserva a pontuação que o reconhecimento já trouxe', () => {
    const transcript = buildFlowingTranscript([chunk('que foi?', 0, 500), chunk('que foi', 600, 1000)]);

    assert.equal(transcript, 'que foi? que foi.');
  });

  it('separa parágrafos por falante e prefixa o nome', () => {
    const transcript = buildFlowingTranscript([
      chunk('bom dia pessoal', 0, 1000, 'Ana'),
      chunk('vamos começar', 1100, 1800, 'Ana'),
      chunk('bom dia', 1900, 2400, 'Bruno'),
    ]);

    assert.equal(transcript, 'Ana: bom dia pessoal. vamos começar.\n\nBruno: bom dia.');
  });

  it('sem marcação de tempo cai num parágrafo único em vez de uma linha por trecho', () => {
    // Trechos antigos (e qualquer cliente que não mande tempo) chegam com 0/0: o
    // fallback tem que ser texto corrido, que é o pior caso aceitável — nunca a
    // lista de fragmentos que o LLM recebia antes.
    const transcript = buildFlowingTranscript([chunk('primeira parte', 0, 0), chunk('segunda parte', 0, 0)]);

    assert.equal(transcript, 'primeira parte. segunda parte.');
  });

  it('ignora trechos vazios ou só com espaço', () => {
    const transcript = buildFlowingTranscript([
      chunk('olha o que eu fiz aqui', 0, 1000),
      chunk('   ', 1100, 1200),
      chunk('ó', 1300, 1500),
    ]);

    assert.equal(transcript, 'olha o que eu fiz aqui. ó.');
  });

  it('devolve string vazia quando não há nada transcrito', () => {
    assert.equal(buildFlowingTranscript([]), '');
  });
});
