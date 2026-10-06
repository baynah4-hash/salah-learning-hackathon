import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type WuduStepId =
  | 'hands'
  | 'mouth-nose'
  | 'face'
  | 'arms'
  | 'head'
  | 'ears'
  | 'feet';

export type WuduAssessment = {
  stepId: WuduStepId | null;
  confidence: number;
  clarity: 'clear' | 'unclear';
};

type Point = Pick<NormalizedLandmark, 'x' | 'y'>;

const STEP_IDS: WuduStepId[] = ['hands', 'mouth-nose', 'face', 'arms', 'head', 'ears', 'feet'];

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function closeness(distanceValue: number, maximum: number): number {
  return Math.max(0, Math.min(1, 1 - distanceValue / maximum));
}

export function classifyWuduGesture(landmarks: NormalizedLandmark[]): WuduAssessment {
  const required = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 27, 28];
  if (landmarks.length < 29 || required.some((index) => !landmarks[index])) {
    return { stepId: null, confidence: 0, clarity: 'unclear' };
  }

  const visibility = required.reduce(
    (sum, index) => sum + (landmarks[index].visibility ?? 0),
    0,
  ) / required.length;
  if (visibility < 0.4) return { stepId: null, confidence: 0, clarity: 'unclear' };

  const nose = landmarks[0];
  const leftEar = landmarks[7];
  const rightEar = landmarks[8];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const shoulders = midpoint(leftShoulder, rightShoulder);
  const hips = midpoint(landmarks[23], landmarks[24]);
  const ankles = midpoint(landmarks[27], landmarks[28]);
  const torsoScale = Math.max(0.08, distance(shoulders, hips));
  const bodyScale = Math.max(0.2, distance(nose, ankles));
  const wrists = [leftWrist, rightWrist];
  const ears = [leftEar, rightEar];
  const scores: Record<WuduStepId, number> = {
    hands: 0,
    'mouth-nose': 0,
    face: 0,
    arms: 0,
    head: 0,
    ears: 0,
    feet: 0,
  };

  const handGap = distance(leftWrist, rightWrist);
  const handsAtMidBody =
    shoulders.y < midpoint(leftWrist, rightWrist).y &&
    midpoint(leftWrist, rightWrist).y < hips.y + torsoScale * 0.15;
  if (handsAtMidBody) {
    scores.hands = closeness(handGap, torsoScale * 0.75);
  }

  const nearestFaceDistance = Math.min(distance(leftWrist, nose), distance(rightWrist, nose));
  scores['mouth-nose'] = closeness(nearestFaceDistance, torsoScale * 0.72);
  const averageFaceDistance = (distance(leftWrist, nose) + distance(rightWrist, nose)) / 2;
  scores.face = closeness(averageFaceDistance, torsoScale * 1.05);

  const armReach = Math.min(distance(leftWrist, rightElbow), distance(rightWrist, leftElbow));
  scores.arms = closeness(armReach, torsoScale * 0.7);

  const eyeLineY = Math.min(leftEar.y, rightEar.y);
  const headReach = wrists
    .filter((wrist) => wrist.y < eyeLineY + torsoScale * 0.06)
    .map((wrist) => Math.abs(wrist.x - nose.x))
    .reduce((best, value) => Math.min(best, value), Number.POSITIVE_INFINITY);
  scores.head = Number.isFinite(headReach)
    ? closeness(headReach, torsoScale * 0.8)
    : 0;

  const nearestEarDistance = Math.min(
    ...wrists.flatMap((wrist) => ears.map((ear) => distance(wrist, ear))),
  );
  scores.ears = closeness(nearestEarDistance, torsoScale * 0.45);

  const nearestFootDistance = Math.min(
    distance(leftWrist, landmarks[27]),
    distance(leftWrist, landmarks[28]),
    distance(rightWrist, landmarks[27]),
    distance(rightWrist, landmarks[28]),
  );
  const handsNearLowerBody = Math.max(leftWrist.y, rightWrist.y) > hips.y;
  scores.feet = handsNearLowerBody
    ? closeness(nearestFootDistance, bodyScale * 0.32)
    : 0;

  const bestStep = STEP_IDS.reduce(
    (best, id) => (scores[id] > scores[best] ? id : best),
    STEP_IDS[0],
  );
  const confidence = scores[bestStep];
  if (confidence < 0.48) {
    return { stepId: null, confidence, clarity: 'unclear' };
  }

  return { stepId: bestStep, confidence, clarity: visibility >= 0.62 ? 'clear' : 'unclear' };
}
