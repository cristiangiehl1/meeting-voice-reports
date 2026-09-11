import type { AudioQuality } from '../lib/audioLevel.ts';

const QUALITY_LABELS: Record<AudioQuality, string> = {
  silencio: 'Sem captação — verifique o microfone',
  fraco: 'Captando, mas fraco',
  bom: 'Captando bem',
  alto: 'Captando alto (pode saturar)',
};

type Props = {
  level: number;
  quality: AudioQuality;
  isCapturingSpeech: boolean;
};

export function LevelMeter({ level, quality, isCapturingSpeech }: Props) {
  return (
    <div className="level-meter" role="meter" aria-valuenow={Math.round(level * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="level-meter__bar">
        <div className={`level-meter__fill level-meter__fill--${quality}`} style={{ width: `${level * 100}%` }} />
      </div>
      <p className={isCapturingSpeech ? 'level-meter__label' : 'level-meter__label muted'}>{QUALITY_LABELS[quality]}</p>
    </div>
  );
}
