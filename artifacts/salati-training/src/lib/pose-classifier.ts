import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type PrayerPose = 'standing' | 'bowing' | 'prostration';

export type PoseAssessment = {
  pose: PrayerPose | null;
  clarity: 'clear' | 'unclear';
};

type Point = Pick<NormalizedLandmark, 'x' | 'y'>;

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function jointAngle(hip: Point, knee: Point, ankle: Point): number {
  const upper = { x: hip.x - knee.x, y: hip.y - knee.y };
  const lower = { x: ankle.x - knee.x, y: ankle.y - knee.y };
  const denominator = Math.hypot(upper.x, upper.y) * Math.hypot(lower.x, lower.y);

  if (denominator < 0.0001) return 180;

  const cosine = Math.min(
    1,
    Math.max(-1, (upper.x * lower.x + upper.y * lower.y) / denominator),
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

function torsoAngleFromVertical(shoulders: Point, hips: Point): number {
  return (
    (Math.atan2(
      Math.abs(shoulders.x - hips.x),
      Math.abs(shoulders.y - hips.y),
    ) *
      180) /
    Math.PI
  );
}

export function classifyPrayerPose(landmarks: NormalizedLandmark[]): PoseAssessment {
  const required = [11, 12, 23, 24, 25, 26, 27, 28];
  if (landmarks.length < 29 || required.some((index) => !landmarks[index])) {
    return { pose: null, clarity: 'unclear' };
  }

  const averageVisibility =
    required.reduce((total, index) => total + (landmarks[index].visibility ?? 0), 0) /
    required.length;

  if (averageVisibility < 0.48) {
    return { pose: null, clarity: 'unclear' };
  }

  const shoulders = midpoint(landmarks[11], landmarks[12]);
  const hips = midpoint(landmarks[23], landmarks[24]);
  const knees = midpoint(landmarks[25], landmarks[26]);
  const ankles = midpoint(landmarks[27], landmarks[28]);
  const torsoAngle = torsoAngleFromVertical(shoulders, hips);
  const leftKneeAngle = jointAngle(landmarks[23], landmarks[25], landmarks[27]);
  const rightKneeAngle = jointAngle(landmarks[24], landmarks[26], landmarks[28]);
  const averageKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
  const head = landmarks[0];
  const headVisible = (head?.visibility ?? 0) >= 0.42;

  if (
    torsoAngle < 29 &&
    hips.y < knees.y &&
    ankles.y > knees.y &&
    distance(shoulders, hips) > 0.08
  ) {
    return { pose: 'standing', clarity: averageVisibility >= 0.64 ? 'clear' : 'unclear' };
  }

  if (torsoAngle >= 34 && torsoAngle <= 90) {
    const looksLowToGround =
      headVisible &&
      head.y > shoulders.y + 0.015 &&
      shoulders.y > hips.y + 0.025 &&
      knees.y > hips.y + 0.015 &&
      averageKneeAngle < 150;

    if (looksLowToGround) {
      return {
        pose: 'prostration',
        clarity: averageVisibility >= 0.64 ? 'clear' : 'unclear',
      };
    }

    if (averageKneeAngle >= 145) {
      return { pose: 'bowing', clarity: averageVisibility >= 0.64 ? 'clear' : 'unclear' };
    }
  }

  return { pose: null, clarity: 'clear' };
}
