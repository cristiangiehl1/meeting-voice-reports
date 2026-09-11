import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportEmailHtml, buildReportEmailSubject } from '../src/emails/reportEmailTemplate.ts';

describe('reportEmailTemplate', () => {
  it('monta o assunto com o tipo de relatório traduzido', () => {
    assert.equal(buildReportEmailSubject('meeting'), 'Relatório de Reunião gerado');
    assert.equal(buildReportEmailSubject('interview'), 'Relatório de Entrevista gerado');
    assert.equal(buildReportEmailSubject('scheduling'), 'Relatório de Agendamento gerado');
  });

  it('renderiza os campos do relatório em uma tabela HTML', () => {
    const html = buildReportEmailHtml('meeting', {
      titulo: 'Revisão do roadmap',
      participantes: ['Ana', 'Bruno'],
      itensDeAcao: [{ tarefa: 'Revisar contrato', responsavel: 'Bruno', prazo: 'sexta-feira' }],
    });

    assert.match(html, /Revisão do roadmap/);
    assert.match(html, /Ana/);
    assert.match(html, /Bruno/);
    assert.match(html, /Revisar contrato/);
  });

  it('escapa conteúdo HTML pra evitar injeção vinda do transcript', () => {
    const html = buildReportEmailHtml('meeting', {
      titulo: '<img src=x onerror=alert(1)>',
    });

    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img/);
  });

  it('mostra um traço para campos vazios/nulos', () => {
    const html = buildReportEmailHtml('scheduling', { localOuLink: null, participantes: [] });

    assert.match(html, /—/);
  });
});
