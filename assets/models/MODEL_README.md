# Tartaria Realms — On-device ML model assets

The Cognitive Orchestrator (`app/ai/CognitiveOrchestrator.ts`) requires two
files in this directory before the AI runtime can boot on device:

1. `model.onnx` — quantized `all-MiniLM-L6-v2` (int8). Target the ~25 MB
   build. The fp32 build (~90 MB) will push the APK past comfortable
   sideload limits and trip Play Store size caps.
2. `vocab.txt` — the matching BERT WordPiece vocab (~250 KB).

Both files are loaded by `SemanticEmbeddingService.initialize(modelPath,
vocabText)`. Without them, `CognitiveOrchestrator.boot()` throws a clear
"not initialized" error at app startup and the rest of the game continues
to run on the deterministic parser only.

## Where to get them

- Model: https://huggingface.co/Xenova/all-MiniLM-L6-v2 (use `model_quantized.onnx`)
- Vocab: same repo, `tokenizer/vocab.txt` (or download from the original
  `sentence-transformers/all-MiniLM-L6-v2` repo)

## How they get bundled

`app.json` declares `expo.assetBundlePatterns: ["assets/**/*"]` so anything
in this folder ships inside the APK. To get the model's absolute path on
device, use `expo-asset`:

```ts
import { Asset } from 'expo-asset';
const asset = Asset.fromModule(require('../../assets/models/model.onnx'));
await asset.downloadAsync();
const modelPath = asset.localUri!;
```

Then read `vocab.txt` with `expo-file-system` and hand both to
`CognitiveOrchestrator.boot(modelPath, vocabText)` behind the splash
screen so the cold-start cost (~500–2000 ms) doesn't block the first
player action.
