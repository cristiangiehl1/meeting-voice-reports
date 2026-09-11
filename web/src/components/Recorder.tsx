import type { RecordingStatus } from '../hooks/useSpeechSession.ts';
import type { TranscriptChunkView } from '../api/types.ts';
import type { AudioQuality } from '../lib/audioLevel.ts';
import { LevelMeter } from './LevelMeter.tsx';

type Props = {
  status: RecordingStatus;
  transcriptChunks: TranscriptChunkView[];
  interimText: string;
  error: string | null;
  audioLevel: number;
  audioQuality: AudioQuality;
  isCapturingSpeech: boolean;
  onStart: () => void;
  onStop: () => void;
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
  onStart,
  onStop,
  onFinalize,
  finalizing,
}: Props) {
  return (
    <div className="card">
      <h2>Gravação</h2>

      <div className="recorder-controls">
        {status === 'idle' || status === 'stopped' ? (
          <button type="button" onClick={onStart}>
            {status === 'stopped' ? 'Gravar de novo' : 'Começar a gravar'}
          </button>
        ) : null}
        {status === 'recording' ? (
          <button type="button" className="danger" onClick={onStop}>
            Parar gravação
          </button>
        ) : null}
        {status === 'requesting' ? <span>Pedindo acesso ao microfone...</span> : null}
      </div>

      {status === 'recording' ? (
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

      <button type="button" onClick={onFinalize} disabled={status === 'recording' || finalizing}>
        {finalizing ? 'Gerando relatório...' : 'Gerar relatório'}
      </button>
    </div>
  );
}
