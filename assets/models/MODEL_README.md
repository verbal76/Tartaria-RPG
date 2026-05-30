# Tartaria Realms — Model assets

This directory is intentionally empty. The MiniLM model is no longer bundled
inside the APK.

On first boot, `CognitiveOrchestrator.boot()` downloads two files to
`FileSystem.documentDirectory + 'tartaria-models/'`:

- `model_quantized.onnx` (~25 MB)
- `vocab.txt` (~250 KB)

See `app/ai/ota/ModelDownloader.ts` for the routine. Sources:

- https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx
- https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/vocab.txt

The folder remains for future bundled assets (icons, ambient audio, etc.)
covered by the `assetBundlePatterns: ["assets/**/*"]` entry in `app.json`.
