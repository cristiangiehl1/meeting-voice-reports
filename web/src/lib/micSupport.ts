export type MicIssue =
  | 'insecure-context'
  | 'no-media-devices'
  | 'no-speech-recognition'
  | 'ios-standalone-pwa'
  | 'no-audio-input'
  | 'permission-denied'
  | 'mic-busy'
  | 'unknown';

export type MicStatus =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'blocked'; issue: MicIssue; message: string };

const ISSUE_MESSAGES: Record<MicIssue, string> = {
  'insecure-context':
    'O navegador só libera o microfone em conexões seguras. Abra o app por HTTPS (ou em localhost) — endereços http:// na rede local não funcionam.',
  'no-media-devices':
    'Este navegador não expõe acesso ao microfone. Abra o app por HTTPS em um navegador atualizado.',
  'no-speech-recognition':
    'Este navegador não suporta reconhecimento de voz (Web Speech API). Use o Chrome (no desktop ou no Android) ou o Safari no iPhone.',
  'ios-standalone-pwa':
    'O reconhecimento de voz não funciona no app instalado na tela de início do iPhone. Abra o mesmo endereço pelo Safari.',
  'no-audio-input':
    'Nenhum microfone foi detectado neste dispositivo. Conecte um microfone e toque em "Verificar de novo".',
  'permission-denied':
    'O acesso ao microfone está bloqueado. Libere o microfone para este site nas permissões do navegador e toque em "Verificar de novo".',
  'mic-busy':
    'O microfone está sendo usado por outro app. Encerre chamadas ou gravadores abertos e tente de novo.',
  unknown: 'Não foi possível acessar o microfone.',
};

const ISSUE_TITLES: Partial<Record<MicIssue, string>> = {
  'ios-standalone-pwa': 'Abra pelo Safari',
  'no-speech-recognition': 'Navegador sem reconhecimento de voz',
  'insecure-context': 'Conexão não segura',
  'no-media-devices': 'Conexão não segura',
};

export function describeMicIssue(issue: MicIssue): string {
  return ISSUE_MESSAGES[issue];
}

/** Nem todo bloqueio é do microfone — dizer "Microfone indisponível" quando o problema
 *  é a origem insegura ou o navegador manda o usuário procurar no lugar errado. */
export function micIssueTitle(issue: MicIssue): string {
  return ISSUE_TITLES[issue] ?? 'Microfone indisponível';
}

/** Só alguns bloqueios podem mudar sem sair da página: permissão liberada, microfone
 *  conectado, outro app fechado. Os demais exigem outra URL ou outro navegador — e um
 *  botão "Verificar de novo" que nunca pode dar certo é pior que botão nenhum. */
export function isRecheckable(issue: MicIssue): boolean {
  return issue === 'permission-denied' || issue === 'no-audio-input' || issue === 'mic-busy' || issue === 'unknown';
}

export function blockedStatus(issue: MicIssue): MicStatus {
  return { kind: 'blocked', issue, message: describeMicIssue(issue) };
}

function getSpeechRecognitionCtor(): typeof SpeechRecognition | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== undefined;
}

export function createSpeechRecognition(): SpeechRecognition | null {
  const Ctor = getSpeechRecognitionCtor();
  return Ctor ? new Ctor() : null;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ se declara como Macintosh; maxTouchPoints desambigua.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplay(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * O medidor de nível precisa segurar um MediaStream aberto, e no Android/iOS isso
 * rouba o microfone do SpeechRecognition — que então não captura nada. Só habilitar
 * onde os dois consumidores convivem (desktop).
 *
 *  Nota: notebooks com tela sensível ao toque caem no regime mobile por este critério.
 *  Perdem o medidor e a retomada em aba de fundo, mas nunca perdem transcrição —
 *  o erro é para o lado seguro.
 */
export function supportsLevelMeter(): boolean {
  return window.matchMedia('(pointer: fine)').matches && navigator.maxTouchPoints === 0;
}

function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    return String((error as { name: unknown }).name);
  }
  return '';
}

export function mapGetUserMediaError(error: unknown): MicIssue {
  switch (errorName(error)) {
    case 'NotAllowedError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no-audio-input';
    case 'NotReadableError':
    case 'AbortError':
      return 'mic-busy';
    case 'SecurityError':
      return 'insecure-context';
    default:
      return 'unknown';
  }
}

export function mapRecognitionError(error: string): MicIssue {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission-denied';
    case 'audio-capture':
      return 'mic-busy';
    default:
      return 'unknown';
  }
}

/** Checagem de capacidade que NÃO pede permissão — roda na montagem da tela. */
export async function detectMicrophone(): Promise<MicStatus> {
  if (!window.isSecureContext) return blockedStatus('insecure-context');
  if (!navigator.mediaDevices?.getUserMedia) return blockedStatus('no-media-devices');

  // Num PWA instalado no iOS o construtor normalmente existe — ele só nunca produz
  // resultado. Por isso a checagem vem antes da de suporte.
  if (isIos() && isStandaloneDisplay()) return blockedStatus('ios-standalone-pwa');
  if (!isSpeechRecognitionSupported()) return blockedStatus('no-speech-recognition');

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    // Alguns navegadores devolvem lista vazia antes de qualquer permissão — isso
    // não prova ausência de microfone, só a lista populada sem 'audioinput' prova.
    if (devices.length > 0 && !devices.some((device) => device.kind === 'audioinput')) {
      return blockedStatus('no-audio-input');
    }
  } catch {
    // enumerateDevices pode falhar sem permissão; não é conclusivo.
  }

  try {
    const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (permission.state === 'denied') return blockedStatus('permission-denied');
  } catch {
    // Safari lança para o nome 'microphone'; seguir sem essa informação.
  }

  return { kind: 'ready' };
}
