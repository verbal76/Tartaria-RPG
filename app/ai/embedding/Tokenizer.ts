const CLS = '[CLS]';
const SEP = '[SEP]';
const UNK = '[UNK]';

export class WordPieceTokenizer {
  private vocab: Map<string, number> = new Map();
  private clsId: number = 101;
  private sepId: number = 102;
  private unkId: number = 100;
  private loaded: boolean = false;

  loadVocab(vocabText: string): void {
    this.vocab.clear();
    const lines = vocabText.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const tok = (lines[i] ?? '').trim();
      if (!tok) continue;
      this.vocab.set(tok, i);
    }
    this.clsId = this.vocab.get(CLS) ?? this.clsId;
    this.sepId = this.vocab.get(SEP) ?? this.sepId;
    this.unkId = this.vocab.get(UNK) ?? this.unkId;
    this.loaded = true;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  vocabSize(): number {
    return this.vocab.size;
  }

  tokenize(text: string, maxLen: number = 128): number[] {
    if (!this.loaded) throw new Error('Tokenizer vocab not loaded');

    const ids: number[] = [this.clsId];
    const normalized = text
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}\s']/gu, ' ')
      .trim();
    if (!normalized) {
      ids.push(this.sepId);
      return ids;
    }

    const words = normalized.split(/\s+/);
    for (const word of words) {
      if (!word) continue;
      this.appendWordPieces(word, ids);
      if (ids.length >= maxLen - 1) break;
    }

    ids.push(this.sepId);
    if (ids.length > maxLen) {
      const truncated = ids.slice(0, maxLen - 1);
      truncated.push(this.sepId);
      return truncated;
    }
    return ids;
  }

  private appendWordPieces(word: string, out: number[]): void {
    let start = 0;
    while (start < word.length) {
      let end = word.length;
      let matchedId: number | undefined;
      let matchedEnd = -1;
      while (start < end) {
        const piece = start === 0 ? word.substring(start, end) : '##' + word.substring(start, end);
        const id = this.vocab.get(piece);
        if (id !== undefined) {
          matchedId = id;
          matchedEnd = end;
          break;
        }
        end--;
      }
      if (matchedId === undefined) {
        out.push(this.unkId);
        return;
      }
      out.push(matchedId);
      start = matchedEnd;
    }
  }
}
