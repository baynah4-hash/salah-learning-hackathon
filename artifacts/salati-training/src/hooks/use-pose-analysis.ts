import { useEffect, useRef, useState, type RefObject } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { classifyPrayerPose, type PrayerPose } from '@/lib/pose-classifier';

export type PoseAnalysisStatus = 'idle' | 'loading' | 'analyzing' | 'error';

export type PoseAnalysisSnapshot = {
  status: PoseAnalysisStatus;
  pose: PrayerPose | null;
  clarity: 'clear' | 'unclear' | null;
  message: string | null;
};

const WASM_BASE_URL = new URL(
  `${import.meta.env.BASE_URL}wasm/mediapipe/`,
  window.location.href,
).toString();

const emptySnapshot: PoseAnalysisSnapshot = {
  status: 'idle',
  pose: null,
  clarity: null,
  message: null,
};

export function usePoseAnalysis(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
  enabled: boolean,
) {
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const [snapshot, setSnapshot] = useState<PoseAnalysisSnapshot>(emptySnapshot);

  useEffect(() => {
    if (!enabled || !stream) {
      setSnapshot(emptySnapshot);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      return;
    }

    let cancelled = false;
    let animationFrameId = 0;
    let lastInferenceAt = 0;
    let lastVideoTime = -1;
    let previousCandidate: PrayerPose | null = null;
    let consecutiveFrames = 0;

    const setFailure = (message: string) => {
      if (!cancelled) {
        setSnapshot({ status: 'error', pose: null, clarity: null, message });
      }
    };

    const run = async () => {
      setSnapshot({ ...emptySnapshot, status: 'loading' });

      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        let landmarker = landmarkerRef.current;
        const modelAssetPath = `${import.meta.env.BASE_URL}models/pose-landmarker/pose_landmarker_lite.task`;

        if (!landmarker) {
          const options = {
            runningMode: 'VIDEO' as const,
            numPoses: 1,
            minPoseDetectionConfidence: 0.55,
            minPosePresenceConfidence: 0.55,
            minTrackingConfidence: 0.5,
          };

          try {
            landmarker = await PoseLandmarker.createFromOptions(vision, {
              ...options,
              baseOptions: { modelAssetPath, delegate: 'GPU' },
            });
          } catch {
            landmarker = await PoseLandmarker.createFromOptions(vision, {
              ...options,
              baseOptions: { modelAssetPath, delegate: 'CPU' },
            });
          }

          if (cancelled) {
            landmarker.close();
            return;
          }
          landmarkerRef.current = landmarker;
        }

        setSnapshot({ ...emptySnapshot, status: 'analyzing' });

        const infer = (now: number) => {
          if (cancelled) return;

          const video = videoRef.current;
          if (
            video &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            video.currentTime !== lastVideoTime &&
            now - lastInferenceAt >= 140
          ) {
            lastInferenceAt = now;
            lastVideoTime = video.currentTime;

            try {
              const result = landmarker!.detectForVideo(video, Math.round(now));
              const assessment = classifyPrayerPose(result.landmarks?.[0] ?? []);
              let stablePose = assessment.pose;

              if (assessment.pose) {
                if (assessment.pose === previousCandidate) {
                  consecutiveFrames += 1;
                } else {
                  previousCandidate = assessment.pose;
                  consecutiveFrames = 1;
                }
                if (consecutiveFrames < 2) stablePose = null;
              } else {
                previousCandidate = null;
                consecutiveFrames = 0;
              }

              setSnapshot((current) => {
                const next = {
                  status: 'analyzing' as const,
                  pose: stablePose,
                  clarity: assessment.clarity,
                  message: null,
                };
                if (
                  current.status === next.status &&
                  current.pose === next.pose &&
                  current.clarity === next.clarity &&
                  current.message === next.message
                ) {
                  return current;
                }
                return next;
              });
            } catch {
              setFailure('تعذّر تحليل الصورة الحالية. أوقفي التحليل ثم أعيدي تشغيله.');
              return;
            }
          }

          animationFrameId = window.requestAnimationFrame(infer);
        };

        animationFrameId = window.requestAnimationFrame(infer);
      } catch {
        setFailure(
          'تعذّر تحميل نموذج التحليل. افتحي التطبيق مرة مع الاتصال أولًا ثم أعيدي المحاولة.',
        );
      }
    };

    void run();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [enabled, stream, videoRef]);

  useEffect(
    () => () => {
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    },
    [],
  );

  return snapshot;
}
