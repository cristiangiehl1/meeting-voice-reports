import type { ReportType } from '../schemas/index.ts';

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  meeting: 'Reunião',
  interview: 'Entrevista',
  scheduling: 'Agendamento',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function labelize(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '<span style="color:#8a9aa6">—</span>';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '<span style="color:#8a9aa6">—</span>';
    const items = value
      .map((item) => (typeof item === 'object' && item !== null ? renderFields(item as Record<string, unknown>) : escapeHtml(String(item))))
      .map((item) => `<li style="margin-bottom:4px">${item}</li>`)
      .join('');
    return `<ul style="margin:4px 0;padding-left:20px">${items}</ul>`;
  }

  if (typeof value === 'object') {
    return renderFields(value as Record<string, unknown>);
  }

  return escapeHtml(String(value));
}

function renderFields(data: Record<string, unknown>): string {
  return `<table style="border-collapse:collapse;width:100%">${Object.entries(data)
    .map(
      ([key, value]) => `
        <tr>
          <td style="padding:6px 12px 6px 0;font-weight:600;color:#5a6b78;vertical-align:top;white-space:nowrap">${escapeHtml(labelize(key))}</td>
          <td style="padding:6px 0">${renderValue(value)}</td>
        </tr>`,
    )
    .join('')}</table>`;
}

export function buildReportEmailSubject(reportType: ReportType): string {
  return `Relatório de ${REPORT_TYPE_LABELS[reportType] ?? reportType} gerado`;
}

export function buildReportEmailHtml(reportType: ReportType, data: unknown): string {
  const title = REPORT_TYPE_LABELS[reportType] ?? reportType;
  const fields = typeof data === 'object' && data !== null ? renderFields(data as Record<string, unknown>) : '';

  return `
    <div style="font-family:sans-serif;color:#14212b;max-width:600px;margin:0 auto">
      <p style="text-transform:uppercase;letter-spacing:0.08em;font-size:12px;color:#5a6b78;margin:0 0 4px">Meeting Voice Reports</p>
      <h1 style="margin:0 0 16px;font-size:20px">Relatório de ${escapeHtml(title)}</h1>
      ${fields}
    </div>
  `;
}
