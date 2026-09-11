import type { RecordingStatus } from '../hooks/useSpeechSession.ts';
import type { TranscriptChunkView } from '../api/types.ts';
import type { AudioQuality } from '../lib/audioLevel.ts';
import { LevelMeter } from './LevelMeter.tsx';

const MIN_TRANSCRIPT_CHARS = 30;

type Props = {
  status: RecordingStatus;
  transcriptChunks: TranscriptChunkView[];
  interimText: string;
  error: string | null;
  audioLevel: number;
  audioQuality: AudioQuality;
  isCapturingSpeech: boolean;
  levelMeterAvailable: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onFinalize: () => void;
  finalizing: boolean;
};

export function Recorder({
  status,
  transcriptChunks,
  interimText,
  error,
  audioLevel,
  audioQuality,
  isCapturingSpeech,
  levelMeterAvailable,
  onStart,
  onStop,
  onReset,
  onFinalize,
  finalizing,
}: Props) {
  const transcriptLength = transcriptChunks.reduce((total, chunk) => total + chunk.text.length, 0);
  const hasMinimumContent = transcriptLength >= MIN_TRANSCRIPT_CHARS;
  const hasExistingRecording = status === 'stopped' && transcriptChunks.length > 0;

  return (
    <div className="card">
      <h2>Gravação</h2>

      <div className="recorder-controls">
        {status === 'idle' ? (
          <button type="button" onClick={onStart}>
            Começar a gravar
          </button>
        ) : null}

        {hasExistingRecording ? (
          <>
            <button type="button" onClick={onStart}>
              Continuar gravação
            </button>
            <button type="button" className="secondary" onClick={onReset}>
              Resetar e começar do zero
            </button>
          </>
        ) : null}

        {status === 'stopped' && transcriptChunks.length === 0 ? (
          <button type="button" onClick={onStart}>
            Começar a gravar
          </button>
        ) : null}

        {status === 'recording' ? (
          <button type="button" className="danger" onClick={onStop}>
            Parar gravação
          </button>
        ) : null}
        {status === 'requesting' ? <span>Pedindo acesso ao microfone...</span> : null}
      </div>

      {status === 'recording' && levelMeterAvailable ? (
        <LevelMeter level={audioLevel} quality={audioQuality} isCapturingSpeech={isCapturingSpeech} />
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <div className="transcript">
        {transcriptChunks.length === 0 && !interimText ? (
          <p className="muted">A transcrição aparece aqui conforme você fala.</p>
        ) : (
          <ul>
            {transcriptChunks.map((chunk, index) => (
              <li key={index}>
                {chunk.speaker ? <strong>{chunk.speaker}: </strong> : null}
                {chunk.text}
              </li>
            ))}
            {interimText ? <li className="muted">{interimText}</li> : null}
          </ul>
        )}
      </div>

      <p className="disclaimer">
        {hasMinimumContent
          ? 'Conteúdo suficiente para gerar o relatório.'
          : `É preciso gravar pelo menos ${MIN_TRANSCRIPT_CHARS} caracteres de transcrição antes de gerar o relatório (atual: ${transcriptLength}).`}
      </p>

      <button type="button" onClick={onFinalize} disabled={status === 'recording' || finalizing || !hasMinimumContent}>
        {finalizing ? 'Gerando relatório...' : 'Gerar relatório'}
      </button>
    </div>
  );
}
