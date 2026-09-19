type Props = {
  isCapturingSpeech: boolean;
  hasInterimText: boolean;
};

/** Substitui o medidor de nível no mobile, onde segurar o microfone para medir RMS
 *  impediria o reconhecimento de voz de funcionar. */
export function SpeechActivityIndicator({ isCapturingSpeech, hasInterimText }: Props) {
  const active = isCapturingSpeech || hasInterimText;

  return (
    <div className={active ? 'speech-activity speech-activity--active' : 'speech-activity'} role="status">
      <span className="speech-activity__dot" aria-hidden="true" />
      <span>{active ? 'Captando fala' : 'Ouvindo — pode falar'}</span>
    </div>
  );
}
