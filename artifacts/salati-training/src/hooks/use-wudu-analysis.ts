import { useEffect, useRef, useState, type RefObject } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { classifyWuduGesture, type WuduAssessment, type WuduStepId } from '@/lib/wudu-classifier';

export type WuduAnalysisSnapshot = WuduAssessment & {
  status: 'idle' | 'loading' | 'analyzing' | 'error';
  message: string | null;
};

const WASM_BASE_URL = new URL(
  `${import.meta.env.BASE_URL}wasm/mediapipe/`,
  window.location.href,
).toString();

const idleSnapshot: WuduAnalysisSnapshot = {
  status: 'idle',
  stepId: null,
  confidence: 0,
  clarity: 'unclear',
  message: null,
};

export function useWuduAnalysis(
  videoRef: RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
  enabled: boolean,
) {
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const [snapshot, setSnapshot] = useState<WuduAnalysisSnapshot>(idleSnapshot);

  useEffect(() => {
    if (!enabled || !stream) {
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      setSnapshot(idleSnapshot);
      return;
    }

    let cancelled = false;
    let animationFrameId = 0;
    let lastInferenceAt = 0;
    let lastVideoTime = -1;
    let previousCandidate: WuduStepId | null = null;
    let consecutiveFrames = 0;

    const setFailure = (message: string) => {
      if (!cancelled) {
        setSnapshot({ ...idleSnapshot, status: 'error', message });
      }
    };

    const run = async () => {
      setSnapshot({ ...idleSnapshot, status: 'loading' });
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        const modelAssetPath = `${import.meta.env.BASE_URL}models/pose-landmarker/pose_landmarker_lite.task`;
        let landmarker = landmarkerRef.current;
        if (!landmarker) {
          const options = {
            runningMode: 'VIDEO' as const,
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.45,
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

        setSnapshot({ ...idleSnapshot, status: 'analyzing' });
        const infer = (now: number) => {
          if (cancelled) return;
          const video = videoRef.current;
          if (
            video &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            video.currentTime !== lastVideoTime &&
            now - lastInferenceAt >= 260
          ) {
            lastInferenceAt = now;
            lastVideoTime = video.currentTime;
            try {
              const result = landmarker!.detectForVideo(video, Math.round(now));
              const assessment = classifyWuduGesture(result.landmarks?.[0] ?? []);
              let stableStep = assessment.stepId;
              if (assessment.stepId) {
                if (assessment.stepId === previousCandidate) {
                  consecutiveFrames += 1;
                } else {
                  previousCandidate = assessment.stepId;
                  consecutiveFrames = 1;
                }
                if (consecutiveFrames < 3) stableStep = null;
              } else {
                previousCandidate = null;
                consecutiveFrames = 0;
              }

              setSnapshot((current) => {
                const next: WuduAnalysisSnapshot = {
                  status: 'analyzing',
                  stepId: stableStep,
                  confidence: assessment.confidence,
                  clarity: assessment.clarity,
                  message: null,
                };
                if (
                  current.status === next.status &&
                  current.stepId === next.stepId &&
                  current.clarity === next.clarity &&
                  Math.abs(current.confidence - next.confidence) < 0.04
                ) {
                  return current;
                }
                return next;
              });
            } catch {
              setFailure('تعذّرت قراءة الصورة الحالية. تابعي الخطوات يدويًا أو أعيدي تشغيل الملاحظة.');
              return;
            }
          }
          animationFrameId = window.requestAnimationFrame(infer);
        };
        animationFrameId = window.requestAnimationFrame(infer);
      } catch {
        setFailure('تعذّر تجهيز الملاحظة البصرية المحلية. يمكنك متابعة خطوات الوضوء يدويًا.');
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
