import { REPORT_TYPES, type ReportType } from '../api/types.ts';

const LABELS: Record<ReportType, string> = {
  meeting: 'Reunião',
  interview: 'Entrevista',
  scheduling: 'Agendamento',
};

type Props = {
  value: ReportType;
  onChange: (value: ReportType) => void;
  onStart: () => void;
  busy: boolean;
};

export function ReportTypePicker({ value, onChange, onStart, busy }: Props) {
  return (
    <div className="card">
      <h2>Que tipo de sessão é essa?</h2>
      <div className="report-type-options" role="radiogroup">
        {REPORT_TYPES.map((type) => (
          <label key={type} className="report-type-option">
            <input
              type="radio"
              name="reportType"
              value={type}
              checked={value === type}
              onChange={() => onChange(type)}
            />
            {LABELS[type]}
          </label>
        ))}
      </div>
      <button type="button" onClick={onStart} disabled={busy}>
        {busy ? 'Criando sessão...' : 'Iniciar sessão'}
      </button>
    </div>
  );
}
