import { useCallback, useEffect, useRef, useState } from 'react';
import { compareRecitation, type WordMatch } from '@/lib/recitation-matcher';

type Status = 'idle' | 'loading' | 'ready' | 'recording' | 'processing' | 'error';

type WorkerRequest =
  | { id: number; type: 'prepare' }
  | { id: number; type: 'transcribe'; audio: ArrayBuffer };

type WorkerResponse =
  | { id: number; type: 'progress'; progress: number | null; message: string }
  | { id: number; type: 'prepared' }
  | { id: number; type: 'transcript'; text: string }
  | { id: number; type: 'error'; message: string };

type PendingRequest = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
};

const AUDIO_SAMPLE_RATE = 16_000;
const MAX_RECORDING_SECONDS = 90;
const REQUIRED_OFFLINE_CACHE = 'salati-training-offline-v5';

function readWorkerCacheName(worker: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, 1_500);
    channel.port1.onmessage = (event: MessageEvent<string>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data);
    };
    try {
      worker.postMessage({ type: 'GET_CACHE_NAME' }, [channel.port2]);
    } catch {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(null);
    }
  });
}

async function waitForOfflineWorker(): Promise<void> {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) {
    throw new Error('هذا المتصفح لا يدعم تجهيز الملفات الكبيرة للاستخدام دون إنترنت.');
  }
  const isCurrentWorkerActive = async () => {
    const controller = navigator.serviceWorker.controller;
    return controller !== null && await readWorkerCacheName(controller) === REQUIRED_OFFLINE_CACHE;
  };
  if (await isCurrentWorkerActive()) return;

  const registration = await navigator.serviceWorker.ready;
  if (registration.active) void registration.update().catch(() => undefined);

  await new Promise<void>((resolve, reject) => {
    let complete = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', checkController);
    };
    const finish = (error?: Error) => {
      if (complete) return;
      complete = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const timeout = window.setTimeout(() => {
      finish(new Error('لم يكتمل تجهيز التطبيق على هذا الجهاز. حدّثي الصفحة ثم أعيدي المحاولة.'));
    }, 15_000);
    const checkController = () => {
      void isCurrentWorkerActive().then((active) => {
        if (active) finish();
      });
    };

    navigator.serviceWorker.addEventListener('controllerchange', checkController);
    registration.update().catch(() => undefined);
    checkController();
  });
}

async function decodeToMono16Khz(blob: Blob): Promise<Float32Array> {
  if (typeof AudioContext === 'undefined' || typeof OfflineAudioContext === 'undefined') {
    throw new Error('تحويل الصوت غير مدعوم في هذا المتصفح.');
  }

  const decoder = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await decoder.close().catch(() => undefined);
  }

  if (decoded.duration < 1.1) {
    throw new Error('كان التسجيل قصيرًا جدًا. أكملي قراءة النص ثم أوقفي الاستماع.');
  }
  if (decoded.duration > MAX_RECORDING_SECONDS + 2) {
    throw new Error('تجاوز التسجيل المدة المناسبة للمراجعة. جرّبي مقطعًا أقصر.');
  }

  const monoBuffer = new AudioBuffer({
    numberOfChannels: 1,
    length: decoded.length,
    sampleRate: decoded.sampleRate,
  });
  const mono = monoBuffer.getChannelData(0);
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const samples = decoded.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) {
      mono[index] += samples[index] / decoded.numberOfChannels;
    }
  }

  const outputLength = Math.ceil(decoded.duration * AUDIO_SAMPLE_RATE);
  const resampler = new OfflineAudioContext(1, outputLength, AUDIO_SAMPLE_RATE);
  const source = resampler.createBufferSource();
  source.buffer = monoBuffer;
  source.connect(resampler.destination);
  source.start(0);
  const resampled = await resampler.startRendering();
  const samples = resampled.getChannelData(0);
  const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  if (rms < 0.003) {
    throw new Error('لم يُلتقط صوت واضح. تحققي من إذن الميكروفون ثم حاولي مرة أخرى.');
  }
  return new Float32Array(samples);
}

export function useRecitationAssessment(targetText: string) {
  const [status, setStatus] = useState<Status>('idle');
  const [modelReady, setModelReady] = useState(false);
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [words, setWords] = useState<WordMatch[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, PendingRequest>());
  const nextIdRef = useRef(1);
  const modelReadyRef = useRef(false);
  const modelPromiseRef = useRef<Promise<void> | null>(null);
  const targetTextRef = useRef(targetText);
  const recordingTargetRef = useRef(targetText);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const maxDurationRef = useRef<number | null>(null);

  targetTextRef.current = targetText;
  modelReadyRef.current = modelReady;

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL('../workers/recitation.worker.ts', import.meta.url), {
      type: 'module',
      name: 'salati-local-recitation',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.type === 'progress') {
        // A model loader can emit one last progress event after it has failed.
        // Ignore it so it does not replace the actionable error shown to the user.
        if (!pendingRef.current.has(response.id)) return;
        setModelProgress(response.progress);
        setMessage(response.message);
        return;
      }
      const pending = pendingRef.current.get(response.id);
      if (!pending) return;
      pendingRef.current.delete(response.id);
      if (response.type === 'error') {
        pending.reject(new Error(response.message));
      } else {
        pending.resolve(response);
      }
    };
    worker.onerror = (event) => {
      console.error('Local recitation worker failed:', event.message);
      const detail = event.message?.trim();
      const error = new Error(detail
        ? `تعذّر تحميل النموذج المحلي (${detail}). تحققي من الاتصال ثم أعيدي المحاولة.`
        : 'تعذّر تشغيل النموذج على هذا الجهاز. أعيدي المحاولة بعد تحديث الصفحة.');
      pendingRef.current.forEach((pending) => pending.reject(error));
      pendingRef.current.clear();
    };
    workerRef.current = worker;
    return worker;
  }, []);

  const requestWorker = useCallback((
    request: WorkerRequest,
    transfer: Transferable[] = [],
  ) => new Promise<WorkerResponse>((resolve, reject) => {
    const worker = getWorker();
    pendingRef.current.set(request.id, { resolve, reject });
    worker.postMessage(request, transfer);
  }), [getWorker]);

  const prepareModel = useCallback(async () => {
    if (modelReadyRef.current) return;
    if (modelPromiseRef.current) return modelPromiseRef.current;
    const id = nextIdRef.current++;
    setStatus('loading');
    setMessage('يجري تجهيز النموذج على هذا الجهاز؛ سيُطلب إذن الميكروفون بعد اكتماله.');
    setModelProgress(0);
    const promise = waitForOfflineWorker()
      .then(() => requestWorker({ id, type: 'prepare' }))
      .then((response) => {
        if (response.type !== 'prepared') throw new Error('لم يكتمل تجهيز النموذج المحلي.');
        modelReadyRef.current = true;
        setModelReady(true);
        setModelProgress(100);
        setStatus('ready');
        setMessage('النموذج جاهز على هذا الجهاز. ابدئي التلاوة عندما تكونين مستعدة.');
      })
      .finally(() => {
        modelPromiseRef.current = null;
      });
    modelPromiseRef.current = promise;
    return promise;
  }, [requestWorker]);

  const transcribe = useCallback(async (samples: Float32Array) => {
    const id = nextIdRef.current++;
    const audio = Float32Array.from(samples).buffer;
    const response = await requestWorker(
      { id, type: 'transcribe', audio },
      [audio],
    );
    if (response.type !== 'transcript') throw new Error('لم تكتمل مراجعة الصوت.');
    return response.text;
  }, [requestWorker]);

  const processRecording = useCallback(async (blob: Blob, target: string) => {
    setStatus('processing');
    setMessage('يجري تحويل الصوت ومراجعته محليًا. قد يستغرق ذلك لحظات.');
    try {
      const samples = await decodeToMono16Khz(blob);
      const transcript = await transcribe(samples);
      if (!transcript.trim()) {
        throw new Error('لم يتعرف النموذج على كلمات واضحة. أعيدي المحاولة في مكان أهدأ.');
      }
      const result = compareRecitation(target, transcript);
      setScore(result.score);
      setWords(result.words);
      setStatus('ready');
      setMessage('اكتملت المقارنة التقريبية. الصوت لم يغادر هذا الجهاز.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'تعذّرت مراجعة التسجيل.');
    }
  }, [transcribe]);

  const onStart = useCallback(async () => {
    setScore(null);
    setWords([]);
    setMessage(null);
    if (!modelReadyRef.current) {
      try {
        await prepareModel();
      } catch (error) {
        setStatus('error');
        setMessage(error instanceof Error
          ? `${error.message} تحققي من توفر ملفات النموذج المحلّي ثم أعيدي المحاولة.`
          : 'تعذّر تجهيز النموذج المحلي. أعيدي المحاولة.');
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setMessage('يحتاج الميكروفون إلى متصفح يدعم الوصول الآمن للصوت.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setStatus('error');
      setMessage('التسجيل الصوتي غير مدعوم في هذا المتصفح. جرّبي متصفحًا أحدث.');
      return;
    }

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      audioStreamRef.current = audioStream;
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
      ].find((candidate) => MediaRecorder.isTypeSupported?.(candidate));
      const recorder = mimeType
        ? new MediaRecorder(audioStream, { mimeType })
        : new MediaRecorder(audioStream);
      chunksRef.current = [];
      recordingTargetRef.current = targetTextRef.current;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        audioStream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        recorderRef.current = null;
        if (maxDurationRef.current !== null) window.clearTimeout(maxDurationRef.current);
        maxDurationRef.current = null;
        setStatus('error');
        setMessage('حدثت مشكلة أثناء التقاط الصوت. تحققي من إذن الميكروفون ثم حاولي مجددًا.');
      };
      recorder.onstop = () => {
        audioStream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        recorderRef.current = null;
        if (maxDurationRef.current !== null) window.clearTimeout(maxDurationRef.current);
        maxDurationRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (!blob.size) {
          setStatus('error');
          setMessage('لم يُنشأ ملف صوتي لهذه المحاولة. تحققي من إذن الميكروفون.');
          return;
        }
        void processRecording(blob, recordingTargetRef.current);
      };
      recorder.start(250);
      setStatus('recording');
      setMessage('اقرئي النص المحدد بوضوح، ثم أوقفي الاستماع. الحد الأقصى ٩٠ ثانية.');
      maxDurationRef.current = window.setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (error) {
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
      setStatus('error');
      const name = error instanceof DOMException ? error.name : '';
      setMessage(name === 'NotAllowedError'
        ? 'لم يُسمح باستخدام الميكروفون. يمكنك تغيير الإذن في إعدادات المتصفح.'
        : name === 'NotFoundError'
          ? 'لم نعثر على ميكروفون متاح على هذا الجهاز.'
          : 'تعذّر بدء التسجيل. تحققي من إذن الميكروفون ثم حاولي مجددًا.');
    }
  }, [prepareModel, processRecording]);

  const onStop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      setStatus('processing');
      setMessage('اكتمل الاستماع؛ يجري الآن فحص الصوت محليًا.');
      try {
        recorder.stop();
      } catch {
        setStatus('error');
        setMessage('تعذّر إيقاف التسجيل بأمان. أعيدي المحاولة.');
      }
    }
  }, []);

  useEffect(() => {
    setScore(null);
    setWords([]);
    if (status !== 'loading' && status !== 'recording' && status !== 'processing') {
      setStatus(modelReadyRef.current ? 'ready' : 'idle');
      setMessage(null);
    }
  }, [targetText]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      try { recorder.stop(); } catch { /* recorder may already be closing */ }
    }
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (maxDurationRef.current !== null) window.clearTimeout(maxDurationRef.current);
    workerRef.current?.terminate();
    pendingRef.current.forEach((pending) => pending.reject(new Error('انتهت جلسة التدريب.')));
    pendingRef.current.clear();
  }, []);

  return {
    status,
    modelReady,
    modelProgress,
    message,
    score,
    words,
    onStart,
    onStop,
  };
}
