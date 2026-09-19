import { useState } from 'react';
import { ApiClientError, createSession, finalizeSession, sendReportEmail } from './api/client.ts';
import { loadApiBaseUrl } from './api/config.ts';
import type { ReportType, SessionView, StoredReportView } from './api/types.ts';
import { useSpeechSession } from './hooks/useSpeechSession.ts';
import { ReportTypePicker } from './components/ReportTypePicker.tsx';
import { Recorder } from './components/Recorder.tsx';
import { MicStatusNotice } from './components/MicStatusNotice.tsx';
import { ReportView } from './components/ReportView.tsx';
import './app.css';

type Step = 'pick-type' | 'session' | 'report';

export default function App() {
  const [apiBaseUrl] = useState(() => loadApiBaseUrl());
  const [step, setStep] = useState<Step>('pick-type');
  const [reportType, setReportType] = useState<ReportType>('meeting');
  const [session, setSession] = useState<SessionView | null>(null);
  const [report, setReport] = useState<StoredReportView | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);

  const audio = useSpeechSession(apiBaseUrl, session?.id ?? '');

  async function handleStartSession() {
    setFlowError(null);
    setCreatingSession(true);
    try {
      const created = await createSession(apiBaseUrl, reportType);
      setSession(created);
      setStep('session');
    } catch (error) {
      setFlowError(error instanceof ApiClientError ? error.message : 'Não foi possível criar a sessão');
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleResetRecording() {
    if (!session) return;
    if (audio.status !== 'idle') audio.stop();

    setFlowError(null);
    setCreatingSession(true);
    try {
      const created = await createSession(apiBaseUrl, session.reportType);
      setSession(created);
      audio.reset();
    } catch (error) {
      setFlowError(error instanceof ApiClientError ? error.message : 'Não foi possível reiniciar a sessão');
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleFinalize() {
    if (!session) return;
    if (audio.status !== 'idle') audio.stop();

    setFlowError(null);
    setFinalizing(true);
    try {
      const generated = await finalizeSession(apiBaseUrl, session.id);
      setReport(generated);
      setStep('report');
    } catch (error) {
      setFlowError(error instanceof ApiClientError ? error.message : 'Não foi possível gerar o relatório');
    } finally {
      setFinalizing(false);
    }
  }

  async function handleReset() {
    if (audio.status === 'recording') audio.stop();

    if (report) {
      setFlowError(null);
      setSendingEmail(true);
      try {
        await sendReportEmail(apiBaseUrl, report.id);
      } catch (error) {
        console.error('Falha ao enviar email do relatório', error);
      } finally {
        setSendingEmail(false);
      }
    }

    audio.reset();
    setSession(null);
    setReport(null);
    setFlowError(null);
    setStep('pick-type');
  }

  return (
    <div className="app">
      <header className="app__header">
        <p className="eyebrow">Meeting Voice Reports</p>
        <h1>Ouça, transcreva e gere o relatório</h1>
      </header>

      <main className="app__main">
        {flowError ? <p className="error">{flowError}</p> : null}

        <MicStatusNotice status={audio.micStatus} onRecheck={audio.refreshMicStatus} />

        {step === 'pick-type' ? (
          <ReportTypePicker value={reportType} onChange={setReportType} onStart={handleStartSession} busy={creatingSession} />
        ) : null}

        {step === 'session' && session ? (
          <Recorder
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
            onReset={handleResetRecording}
            onFinalize={handleFinalize}
            finalizing={finalizing}
          />
        ) : null}

        {step === 'report' && report ? (
          <>
            <ReportView report={report} />
            <button type="button" onClick={handleReset} disabled={sendingEmail}>
              {sendingEmail ? 'Enviando email...' : 'Nova sessão'}
            </button>
          </>
        ) : null}
      </main>
    </div>
  );
}
