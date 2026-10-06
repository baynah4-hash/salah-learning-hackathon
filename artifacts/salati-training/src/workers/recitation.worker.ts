type WorkerRequest =
  | { id: number; type: 'prepare' }
  | { id: number; type: 'transcribe'; audio: ArrayBuffer };

type WorkerResponse =
  | { id: number; type: 'progress'; progress: number | null; message: string }
  | { id: number; type: 'prepared' }
  | { id: number; type: 'transcript'; text: string }
  | { id: number; type: 'error'; message: string };

const workerScope = self as unknown as {
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<WorkerRequest>) => void,
  ) => void;
  postMessage: (message: WorkerResponse) => void;
};

let transcribeAudio: ((audio: Float32Array) => Promise<string>) | null = null;

function postError(id: number, error: unknown) {
  workerScope.postMessage({
    id,
    type: 'error',
    message: error instanceof Error ? error.message : 'تعذّر تشغيل المراجعة المحلية.',
  });
}

async function prepareModel(id: number) {
  if (!transcribeAudio) {
    const { env, pipeline } = await import('@huggingface/transformers');
    const assetUrl = (path: string) =>
      new URL(`${import.meta.env.BASE_URL}${path}`, self.location.href).toString();

    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = assetUrl('models/');
    env.useBrowserCache = true;
    env.useWasmCache = true;
    env.backends.onnx.wasm!.numThreads = 1;
    env.backends.onnx.wasm!.wasmPaths = {
      mjs: assetUrl('wasm/onnxruntime/ort-wasm-simd-threaded.mjs'),
      wasm: assetUrl('wasm/onnxruntime/ort-wasm-simd-threaded.wasm'),
    };

    const recognizer = await pipeline(
      'automatic-speech-recognition',
      'whisper-tiny',
      {
        device: 'wasm',
        dtype: 'q8',
        local_files_only: true,
        progress_callback: (info) => {
          const progress = 'progress' in info
            ? Math.max(0, Math.min(100, Math.round(info.progress)))
            : null;
          workerScope.postMessage({
            id,
            type: 'progress',
            progress,
            message: info.status === 'progress'
              ? `جارٍ تجهيز ${info.file}`
              : 'جارٍ تحميل ملفات النموذج المحلي',
          });
        },
      },
    );

    transcribeAudio = async (audio) => {
      const result = await recognizer(audio, {
        language: 'arabic',
        task: 'transcribe',
        return_timestamps: 'word',
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      return result.text.trim();
    };
  }

  workerScope.postMessage({ id, type: 'prepared' });
}

workerScope.addEventListener('message', (event) => {
  const request = event.data;
  if (request.type === 'prepare') {
    void prepareModel(request.id).catch((error: unknown) => postError(request.id, error));
    return;
  }

  if (!transcribeAudio) {
    postError(request.id, new Error('النموذج المحلي غير جاهز.'));
    return;
  }

  void transcribeAudio(new Float32Array(request.audio))
    .then((text) => workerScope.postMessage({ id: request.id, type: 'transcript', text }))
    .catch((error: unknown) => postError(request.id, error));
});
