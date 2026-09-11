import type { StoredReportView } from '../api/types.ts';

function labelize(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span className="muted">—</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="muted">—</span>;
    return (
      <ul>
        {value.map((item, index) => (
          <li key={index}>
            {typeof item === 'object' && item !== null ? <ReportFields data={item as Record<string, unknown>} /> : String(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object') {
    return <ReportFields data={value as Record<string, unknown>} />;
  }

  return <span>{String(value)}</span>;
}

function ReportFields({ data }: { data: Record<string, unknown> }) {
  return (
    <dl className="report-fields">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="report-field">
          <dt>{labelize(key)}</dt>
          <dd>
            <Value value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

type Props = {
  report: StoredReportView;
};

export function ReportView({ report }: Props) {
  return (
    <div className="card">
      <h2>Relatório gerado</h2>
      <ReportFields data={report.data as Record<string, unknown>} />
    </div>
  );
}
