#!/usr/bin/env python3
"""Fetch the public Salati demo assets and adapt them for this repo's Pages path."""

from pathlib import Path
from urllib.request import Request, urlopen


ORIGIN = "https://salati-prayer-practice-preview.baynah4.chatgpt.site"
BASE_PATH = "/salah-learning-hackathon"
OUTPUT = Path("_site")
ASSETS = (
    "favicon.svg",
    "assets/index-Cavw7DBp.css",
    "assets/recitation.worker-DcPnY5xt.js",
    "assets/ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm.part-00",
    "assets/ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm.part-01",
    "assets/index-CY_cQMnD.js",
    "assets/transformers.web-BPIWZ9iR.js",
    "assets/index-D0WbC7jH.js",
    "assets/ort-wasm-simd-threaded.asyncify-CxOG5pUO.wasm.parts.json",
    "service-worker.js",
    "models/pose-landmarker/pose_landmarker_lite.task",
    "models/whisper-tiny/preprocessor_config.json",
    "models/whisper-tiny/generation_config.json",
    "models/whisper-tiny/merges.txt",
    "models/whisper-tiny/config.json",
    "models/whisper-tiny/vocab.json",
    "models/whisper-tiny/onnx/encoder_model_quantized.onnx",
    "models/whisper-tiny/onnx/decoder_model_merged_quantized.onnx.part-01",
    "models/whisper-tiny/onnx/decoder_model_merged_quantized.onnx.part-00",
    "models/whisper-tiny/onnx/decoder_model_merged_quantized.onnx.parts.json",
    "models/whisper-tiny/tokenizer_config.json",
    "models/whisper-tiny/added_tokens.json",
    "models/whisper-tiny/tokenizer.json",
    "models/whisper-tiny/normalizer.json",
    "models/whisper-tiny/special_tokens_map.json",
    "robots.txt",
    "wasm/mediapipe/vision_wasm_nosimd_internal.js",
    "wasm/mediapipe/vision_wasm_module_internal.wasm",
    "wasm/mediapipe/vision_wasm_internal.js",
    "wasm/mediapipe/vision_wasm_module_internal.js",
    "wasm/mediapipe/vision_wasm_nosimd_internal.wasm",
    "wasm/mediapipe/vision_wasm_internal.wasm",
    "wasm/onnxruntime/ort-wasm-simd-threaded.wasm",
    "wasm/onnxruntime/ort-wasm-simd-threaded.mjs",
    "manifest.webmanifest",
    "fonts/JF-Flat-Regular.ttf",
    "index.html",
)


def fetch(path: str) -> bytes:
    request = Request(f"{ORIGIN}/{path}", headers={"User-Agent": "Salati-GitHub-Pages"})
    with urlopen(request, timeout=120) as response:
        payload = response.read()
        content_type = response.headers.get("Content-Type", "").lower()
    if path.endswith((".wasm", ".task", ".ttf", ".onnx", ".part-00", ".part-01")):
        if "text/html" in content_type or payload.lstrip().lower().startswith((b"<!doctype html", b"<html")):
            raise RuntimeError(f"Expected a binary asset but received HTML for {path}")
    return payload


def replace_text(path: str, replacements: tuple[tuple[str, str], ...]) -> None:
    file_path = OUTPUT / path
    text = file_path.read_text(encoding="utf-8")
    for old, new in replacements:
        if old not in text:
            raise RuntimeError(f"Expected route was missing in {path}: {old}")
        text = text.replace(old, new)
    file_path.write_text(text, encoding="utf-8")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for path in ASSETS:
        destination = OUTPUT / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(fetch(path))
        print(f"Downloaded {path}")

    replace_text(
        "index.html",
        (
            ('href="/manifest.webmanifest"', f'href="{BASE_PATH}/manifest.webmanifest"'),
            ('href="/favicon.svg"', f'href="{BASE_PATH}/favicon.svg"'),
            ('href="/fonts/JF-Flat-Regular.ttf"', f'href="{BASE_PATH}/fonts/JF-Flat-Regular.ttf"'),
            ('src="/assets/index-D0WbC7jH.js"', f'src="{BASE_PATH}/assets/index-D0WbC7jH.js"'),
            ('href="/assets/index-Cavw7DBp.css"', f'href="{BASE_PATH}/assets/index-Cavw7DBp.css"'),
        ),
    )
    replace_text(
        "manifest.webmanifest",
        (
            ('"start_url": "/"', f'"start_url": "{BASE_PATH}/"'),
            ('"scope": "/"', f'"scope": "{BASE_PATH}/"'),
            ('"src": "/favicon.svg"', f'"src": "{BASE_PATH}/favicon.svg"'),
        ),
    )
    replace_text(
        "assets/index-Cavw7DBp.css",
        (('/fonts/JF-Flat-Regular.ttf', f'{BASE_PATH}/fonts/JF-Flat-Regular.ttf'),),
    )
    replace_text(
        "assets/recitation.worker-DcPnY5xt.js",
        (("new URL(`/${s}`,self.location.href)", f"new URL(`{BASE_PATH}/${{s}}`,self.location.href)"),),
    )
    replace_text(
        "assets/index-D0WbC7jH.js",
        (
            ('new URL("/wasm/mediapipe/",window.location.href)', f'new URL("{BASE_PATH}/wasm/mediapipe/",window.location.href)'),
            ('"/models/pose-landmarker/pose_landmarker_lite.task"', f'"{BASE_PATH}/models/pose-landmarker/pose_landmarker_lite.task"'),
            ('"/assets/recitation.worker-DcPnY5xt.js"', f'"{BASE_PATH}/assets/recitation.worker-DcPnY5xt.js"'),
            ('navigator.serviceWorker.register("/service-worker.js")', f'navigator.serviceWorker.register("{BASE_PATH}/service-worker.js")'),
            ('base:"/".replace(/\\/$/,"")', f'base:"{BASE_PATH}".replace(/\\/$/,"")'),
        ),
    )
    print(f"Prepared {len(ASSETS)} files for {BASE_PATH}/")


if __name__ == "__main__":
    main()
