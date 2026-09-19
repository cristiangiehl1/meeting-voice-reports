import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { Mail } from 'lucide-react';
import { ApiClientError, createSession, finalizeSession, sendReportEmail } from './api/client.ts';
import { loadApiBaseUrl } from './api/config.ts';
import type { ReportType, SessionView, StoredReportView } from './api/types.ts';
import { useSpeechSession } from './hooks/useSpeechSession.ts';
import { AppShell, type Step } from './components/AppShell.tsx';
import { ReportTypePicker } from './components/ReportTypePicker.tsx';
import { Recorder } from './components/Recorder.tsx';
import { MicStatusNotice } from './components/MicStatusNotice.tsx';
import { ReportView } from './components/ReportView.tsx';
import { FinalizingOverlay } from './components/FinalizingOverlay.tsx';
import { EmailDelivery } from './components/EmailDelivery.tsx';
import { saveLastRecipients } from './lib/recipients.ts';
import { Button } from './components/ui/Button.tsx';

export default function App() {
  const [apiBaseUrl] = useState(() => loadApiBaseUrl());
  const [step, setStep] = useState<Step>('pick-type');
  const [reportType, setReportType] = useState<ReportType>('meeting');
  const [session, setSession] = useState<SessionView | null>(null);
  const [report, setReport] = useState<StoredReportView | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const audio = useSpeechSession(apiBaseUrl, session?.id ?? '');

  function reportFlowError(error: unknown, fallback: string) {
    toast.error(error instanceof ApiClientError ? error.message : fallback);
  }

  async function handleStartSession() {
    setCreatingSession(true);
    try {
      const created = await createSession(apiBaseUrl, reportType);
      setSession(created);
      setStep('session');
    } catch (error) {
      reportFlowError(error, 'Não foi possível criar a sessão');
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleResetRecording() {
    if (!session) return;
    if (audio.status !== 'idle') audio.stop();

    setCreatingSession(true);
    try {
      const created = await createSession(apiBaseUrl, session.reportType);
      setSession(created);
      audio.reset();
      toast.success('Gravação descartada. Pode começar de novo.');
    } catch (error) {
      reportFlowError(error, 'Não foi possível reiniciar a sessão');
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleFinalize() {
    if (!session) return;
    if (audio.status !== 'idle') audio.stop();

    setFinalizing(true);
    try {
      const generated = await finalizeSession(apiBaseUrl, session.id);
      setReport(generated);
      setStep('report');
    } catch (error) {
      reportFlowError(error, 'Não foi possível gerar o relatório');
    } finally {
      setFinalizing(false);
    }
  }

  async function handleSendEmail(recipients: string[]) {
    if (!report) return;

    setSendingEmail(true);
    try {
      await sendReportEmail(apiBaseUrl, report.id, recipients);
      saveLastRecipients(recipients.join(', '));
      toast.success(
        recipients.length === 1
          ? `Relatório enviado para ${recipients[0]}.`
          : `Relatório enviado para ${recipients.length} destinatários.`,
      );
      startNewSession();
    } catch (error) {
      reportFlowError(error, 'O relatório não pôde ser enviado por email');
    } finally {
      setSendingEmail(false);
    }
  }

  /** Volta pro começo descartando a sessão e o relatório atuais. */
  function startNewSession() {
    if (audio.status !== 'idle') audio.stop();

    audio.reset();
    setSession(null);
    setReport(null);
    setStep('pick-type');
  }

  return (
    <>
      <AppShell step={step}>
        <MicStatusNotice status={audio.micStatus} onRecheck={audio.refreshMicStatus} />

        {step === 'pick-type' ? (
          <ReportTypePicker
            value={reportType}
            onChange={setReportType}
            onStart={() => void handleStartSession()}
            busy={creatingSession}
          />
        ) : null}

        {step === 'session' && session ? (
          <Recorder
            // Remontar por sessão zera o cronômetro de gravação. O transcript não vem
            // daqui — mora no useSpeechSession e só some com audio.reset(), chamado
            // ao descartar a gravação ou ao começar outra sessão.
            key={session.id}
            status={audio.status}
            transcriptChunks={audio.transcriptChunks}
            interimText={audio.interimText}
            error={audio.error}
            audioLevel={audio.audioLevel}
            audioQuality={audio.audioQuality}
            isCapturingSpeech={audio.isCapturingSpeech}
            micBlocked={audio.micStatus.kind === 'blocked'}
            showLevelMeter={audio.showLevelMeter}
            onStart={audio.start}
            onStop={audio.stop}
            onReset={() => void handleResetRecording()}
            onFinalize={() => void handleFinalize()}
            finalizing={finalizing}
          />
        ) : null}

        {step === 'report' && report ? (
          <>
            <ReportView report={report} />
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="ghost" size="sm" onClick={startNewSession}>
                Descartar e começar nova sessão
              </Button>
              <Button size="lg" onClick={() => setStep('email')} icon={<Mail className="size-4" />}>
                Enviar por email
              </Button>
            </div>
          </>
        ) : null}

        {step === 'email' && report ? (
          <EmailDelivery
            onSend={(recipients) => void handleSendEmail(recipients)}
            onSkip={startNewSession}
            sending={sendingEmail}
          />
        ) : null}
      </AppShell>

      <FinalizingOverlay open={finalizing} />
      <Toaster
        position="top-center"
        theme="system"
        toastOptions={{
          className: 'glass-raised !rounded-full !text-ink font-sans',
        }}
      />
    </>
  );
}
