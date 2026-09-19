import { FileText, Mic, RotateCcw, Square } from 'lucide-react';
import { motion } from 'motion/react';
import type { RecordingStatus } from '../hooks/useSpeechSession.ts';
import { useElapsedTime } from '../hooks/useElapsedTime.ts';
import type { TranscriptChunkView } from '../api/types.ts';
import type { AudioQuality } from '../lib/audioLevel.ts';
import { cn } from '../lib/cn.ts';
import { AudioVisualizer } from './AudioVisualizer.tsx';
import { TranscriptPanel } from './TranscriptPanel.tsx';
import { Button } from './ui/Button.tsx';
import { Card, CardBody } from './ui/Card.tsx';

const MIN_TRANSCRIPT_CHARS = 30;

type Props = {
  status: RecordingStatus;
  transcriptChunks: TranscriptChunkView[];
  interimText: string;
  error: string | null;
  audioLevel: number;
  audioQuality: AudioQuality;
  isCapturingSpeech: boolean;
  micBlocked: boolean;
  showLevelMeter: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onFinalize: () => void;
  finalizing: boolean;
};

/** Botão principal de gravar/parar. O anel pulsante existe só enquanto grava — é o
 *  sinal de "está no ar" que o usuário procura de longe, no meio da reunião. */
function RecordButton({
  recording,
  disabled,
  onClick,
}: {
  recording: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={recording ? 'Parar gravação' : 'Começar a gravar'}
      className={cn(
        'relative grid size-16 shrink-0 place-items-center rounded-full transition-all duration-200',
        'active:scale-95 disabled:pointer-events-none disabled:opacity-40',
        recording
          ? 'bg-[color-mix(in_oklch,var(--danger)_22%,transparent)] text-danger ring-1 ring-inset ring-[color-mix(in_oklch,var(--danger)_55%,transparent)]'
          : 'bg-accent text-accent-ink shadow-[0_14px_36px_-14px_var(--accent)] hover:brightness-110',
      )}
    >
      {recording ? (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full ring-2 ring-danger/50"
          animate={{ scale: [1, 1.28], opacity: [0.7, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      ) : null}
      {recording ? <Square className="size-5 fill-current" /> : <Mic className="size-6" />}
    </button>
  );
}

export function Recorder({
  status,
  transcriptChunks,
  interimText,
  error,
  audioLevel,
  audioQuality,
  isCapturingSpeech,
  micBlocked,
  showLevelMeter,
  onStart,
  onStop,
  onReset,
  onFinalize,
  finalizing,
}: Props) {
  const recording = status === 'recording';
  const requesting = status === 'requesting';
  const charCount = transcriptChunks.reduce((total, chunk) => total + chunk.text.length, 0);
  const hasMinimumContent = charCount >= MIN_TRANSCRIPT_CHARS;
  const hasExistingRecording = status === 'stopped' && transcriptChunks.length > 0;
  const elapsedMs = useElapsedTime(recording);

  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-4">
          <RecordButton
            recording={recording}
            disabled={micBlocked || requesting || finalizing}
            onClick={recording ? onStop : onStart}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="font-display text-lg font-semibold tracking-tight">
              {recording
                ? 'Gravando'
                : requesting
                  ? 'Pedindo acesso ao microfone'
                  : hasExistingRecording
                    ? 'Gravação pausada'
                    : 'Pronto para começar'}
            </p>
            <p className="text-sm text-muted text-pretty">
              {recording
                ? 'Fale normalmente — cada trecho reconhecido é salvo na hora.'
                : hasExistingRecording
                  ? 'Continue de onde parou ou descarte e recomece.'
                  : 'Toque no microfone para iniciar a transcrição ao vivo.'}
            </p>
          </div>
        </div>

        {recording ? (
          <AudioVisualizer
            showWaveform={showLevelMeter}
            level={audioLevel}
            quality={audioQuality}
            isCapturingSpeech={isCapturingSpeech}
            hasInterimText={interimText.length > 0}
            elapsedMs={elapsedMs}
          />
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-[color-mix(in_oklch,var(--danger)_12%,transparent)] px-3.5 py-2.5 text-sm text-danger ring-1 ring-inset ring-[color-mix(in_oklch,var(--danger)_35%,transparent)]"
          >
            {error}
          </p>
        ) : null}

        <TranscriptPanel
          chunks={transcriptChunks}
          interimText={interimText}
          charCount={charCount}
          minChars={MIN_TRANSCRIPT_CHARS}
        />

        <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          {hasExistingRecording ? (
            <Button variant="ghost" size="sm" onClick={onReset} icon={<RotateCcw className="size-4" />}>
              Descartar e recomeçar
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}

          <Button
            size="lg"
            onClick={onFinalize}
            loading={finalizing}
            disabled={recording || requesting || !hasMinimumContent}
            icon={finalizing ? undefined : <FileText className="size-4" />}
            className="sm:ml-auto"
          >
            {finalizing ? 'Gerando relatório' : 'Gerar relatório'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
