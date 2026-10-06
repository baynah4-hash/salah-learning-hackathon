export type WordMatch = {
  target: string;
  heard: string | null;
  score: number;
  status: 'matched' | 'missing' | 'different';
};

export type RecitationMatch = {
  score: number;
  words: WordMatch[];
};

const ARABIC_MARKS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]/gu;
const NON_WORDS = /[^\p{Script=Arabic}\s]/gu;

export function normalizeArabicSpeech(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/ـ/gu, '')
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآٱ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/ؤ/gu, 'و')
    .replace(/ئ/gu, 'ي')
    .replace(NON_WORDS, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function characterSimilarity(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  if (!a.length || !b.length) return 0;

  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return Math.max(0, 1 - row[b.length] / Math.max(a.length, b.length));
}

export function compareRecitation(targetText: string, transcript: string): RecitationMatch {
  const targets = normalizeArabicSpeech(targetText).split(' ').filter(Boolean);
  const heard = normalizeArabicSpeech(transcript).split(' ').filter(Boolean);

  if (!targets.length) return { score: 0, words: [] };

  const costs = Array.from({ length: targets.length + 1 }, () =>
    Array<number>(heard.length + 1).fill(0),
  );
  for (let i = 0; i <= targets.length; i += 1) costs[i][0] = i;
  for (let j = 0; j <= heard.length; j += 1) costs[0][j] = j;

  for (let i = 1; i <= targets.length; i += 1) {
    for (let j = 1; j <= heard.length; j += 1) {
      costs[i][j] = Math.min(
        costs[i - 1][j] + 1,
        costs[i][j - 1] + 1,
        costs[i - 1][j - 1] + (targets[i - 1] === heard[j - 1] ? 0 : 1),
      );
    }
  }

  const reversed: WordMatch[] = [];
  let i = targets.length;
  let j = heard.length;
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      targets[i - 1] === heard[j - 1] &&
      costs[i][j] === costs[i - 1][j - 1]
    ) {
      reversed.push({ target: targets[i - 1], heard: heard[j - 1], score: 100, status: 'matched' });
      i -= 1;
      j -= 1;
      continue;
    }

    if (i > 0 && j > 0 && costs[i][j] === costs[i - 1][j - 1] + 1) {
      const similarity = characterSimilarity(targets[i - 1], heard[j - 1]);
      reversed.push({
        target: targets[i - 1],
        heard: heard[j - 1],
        score: Math.round(similarity * 80),
        status: 'different',
      });
      i -= 1;
      j -= 1;
      continue;
    }

    if (i > 0 && costs[i][j] === costs[i - 1][j] + 1) {
      reversed.push({ target: targets[i - 1], heard: null, score: 0, status: 'missing' });
      i -= 1;
      continue;
    }

    reversed.push({
      target: 'كلمة إضافية',
      heard: heard[j - 1],
      score: 0,
      status: 'different',
    });
    j -= 1;
  }

  const words = reversed.reverse();
  const score = Math.round(words.reduce((total, word) => total + word.score, 0) / words.length);
  return { score, words };
}
