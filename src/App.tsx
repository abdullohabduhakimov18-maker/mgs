import { useCallback, useEffect, useRef, useState } from 'react';
import { SpaceParticleCanvas, type ExperienceStage } from './components/SpaceParticleCanvas';
import { MultilingualLoveCaption } from './components/MultilingualLoveCaption';

const OPENING_DURATION_MS = 2500;
const CIRCULATE_DURATION_MS = 1850;
const NAME_HOLD_DURATION_MS = 3200;
const BACKGROUND_TRACK_SRC = '/assets/aistudio/__________________________________dbdd1dd6.mp3';

export default function App() {
  const [stage, setStage] = useState<ExperienceStage>('envelope');
  const [envelopeReady, setEnvelopeReady] = useState(false);
  const [showFlowerCaption, setShowFlowerCaption] = useState(false);

  const timersRef = useRef<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const fadeFrameRef = useRef<number | null>(null);

  const cancelFade = useCallback(() => {
    if (fadeFrameRef.current !== null) {
      cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
  }, []);

  const fadeVolumeIn = useCallback(
    (audio: HTMLAudioElement, targetVol = 0.65, durationMs = 1100) => {
      cancelFade();
      const clampedTarget = Math.max(0, Math.min(1, targetVol));
      audio.volume = 0;
      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.max(0, Math.min(1, (now - start) / durationMs));
        audio.volume = Math.max(0, Math.min(1, clampedTarget * progress));
        if (progress < 1) {
          fadeFrameRef.current = requestAnimationFrame(step);
        } else {
          fadeFrameRef.current = null;
        }
      };
      fadeFrameRef.current = requestAnimationFrame(step);
    },
    [cancelFade],
  );

  const startBackgroundMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioUnlockedRef.current || !audio.paused) return;

    void audio
      .play()
      .then(() => {
        audioUnlockedRef.current = true;
        fadeVolumeIn(audio, 0.65, 1100);
      })
      .catch(() => {
        // Browser blocked unmuted autoplay before user interaction; interaction listeners will unlock it.
      });
  }, [fadeVolumeIn]);

  // Play automatically on mount, and unlock immediately on first interaction if browser blocks autoplay
  useEffect(() => {
    startBackgroundMusic();

    const onFirstGesture = () => {
      startBackgroundMusic();
      if (audioUnlockedRef.current) {
        window.removeEventListener('pointerdown', onFirstGesture);
        window.removeEventListener('keydown', onFirstGesture);
      }
    };

    window.addEventListener('pointerdown', onFirstGesture, { passive: true });
    window.addEventListener('keydown', onFirstGesture, { passive: true });

    return () => {
      cancelFade();
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
  }, [cancelFade, startBackgroundMusic]);

  const clearScheduled = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearScheduled();
  }, [clearScheduled]);

  // Fade in "For you" and "Open the envelope" right as the space dots finish forming the envelope
  useEffect(() => {
    if (stage !== 'envelope') return;
    setEnvelopeReady(false);
    const readyTimer = window.setTimeout(() => {
      setEnvelopeReady(true);
    }, 1550);
    return () => window.clearTimeout(readyTimer);
  }, [stage]);

  const handleOpenEnvelope = useCallback(() => {
    if (stage !== 'envelope') return;
    clearScheduled();
    setShowFlowerCaption(false);
    startBackgroundMusic();
    setStage('opening');

    const circulateTimer = window.setTimeout(() => {
      setStage('circulating');
    }, OPENING_DURATION_MS);

    const nameTimer = window.setTimeout(() => {
      setStage('name');
    }, OPENING_DURATION_MS + CIRCULATE_DURATION_MS);

    const flowerTimer = window.setTimeout(() => {
      setStage('flower');
    }, OPENING_DURATION_MS + CIRCULATE_DURATION_MS + NAME_HOLD_DURATION_MS);

    const captionTimer = window.setTimeout(() => {
      setShowFlowerCaption(true);
    }, OPENING_DURATION_MS + CIRCULATE_DURATION_MS + NAME_HOLD_DURATION_MS + 2750);

    timersRef.current = [circulateTimer, nameTimer, flowerTimer, captionTimer];
  }, [clearScheduled, stage, startBackgroundMusic]);

  return (
    <main className="relative h-[100svh] w-full overflow-hidden bg-[#05060c] select-none">
      {/* Headless background music with no UI controls */}
      <audio
        ref={audioRef}
        src={BACKGROUND_TRACK_SRC}
        autoPlay
        loop
        preload="auto"
        aria-hidden="true"
        className="hidden"
      />

      {/* Full-screen celestial particle field */}
      <SpaceParticleCanvas
        stage={stage}
        onOpenEnvelope={handleOpenEnvelope}
      />

      {/* Hero Viewport (100svh) holding envelope and chamomile finale captions */}
      <section className="relative h-[100svh] w-full pointer-events-none">
        {/* Stage 1: "For you" text & Open trigger below the envelope */}
        <div
          className={`pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center px-6 transition-all duration-700 ${
            stage === 'envelope' && envelopeReady
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-3'
          }`}
          style={{ top: 'calc(40vh + min(36vw, 170px) * 0.64 + 28px)' }}
        >
          <p className="font-editorial text-3xl sm:text-4xl font-normal tracking-wide text-slate-100 drop-shadow-[0_2px_18px_rgba(255,255,255,0.22)]">
            For you
          </p>

          <button
            type="button"
            onClick={handleOpenEnvelope}
            disabled={stage !== 'envelope' || !envelopeReady}
            tabIndex={stage === 'envelope' && envelopeReady ? 0 : -1}
            className="pointer-events-auto mt-5 min-h-[44px] whitespace-nowrap rounded-full border border-rose-400/35 bg-rose-500/15 px-7 py-2.5 text-sm font-medium tracking-wide text-rose-100 backdrop-blur-sm transition-all duration-200 hover:border-rose-300/60 hover:bg-rose-500/25 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:pointer-events-none"
          >
            Open the envelope
          </button>
        </div>

        {/* Stage 4: "I love you" cycling through world languages below the chamomile flower */}
        <div
          className={`pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center px-6 transition-all duration-1000 ${
            stage === 'flower' && showFlowerCaption
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-4'
          }`}
          style={{ top: '65%' }}
        >
          <MultilingualLoveCaption active={stage === 'flower' && showFlowerCaption} />
        </div>
      </section>
    </main>
  );
}
