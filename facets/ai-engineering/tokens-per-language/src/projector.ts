/**
 * tokens-per-language projector — 걸음을 그림으로 옮긴다.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다. stage 는 필수 필드 타입으로 받는다 (C9).
 * 화면 문안도 여기서 messages 로 해석한다 — algorithm 은 수만 보낸다 (C10).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type TokensPerLanguageStage = {
  setCaption(text: string): void;
  showVocab(v: { corpusWords: number; tokens: string[] }): Promise<void>;
  showSentences(): Promise<void>;
  scatter(v: {
    code: string;
    pieces: string[];
    pieceCount: number;
    ratioTenths: number;
  }): Promise<void>;
  markContrast(baseCode: string): Promise<void>;
  reset(): void;
};

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as Record<string, unknown>;
}

function readVocab(payload: unknown): { corpusWords: number; tokens: string[] } | null {
  const p = asRecord(payload);
  if (p === null) return null;
  const { corpusWords, tokens } = p;
  if (typeof corpusWords !== 'number' || !Array.isArray(tokens)) return null;
  const list = tokens.filter((token): token is string => typeof token === 'string');
  return { corpusWords, tokens: list };
}

function readScatter(payload: unknown): {
  code: string;
  chars: number;
  pieces: string[];
  pieceCount: number;
  ratioTenths: number;
} | null {
  const p = asRecord(payload);
  if (p === null) return null;
  const { code, chars, pieces, pieceCount, ratioTenths } = p;
  if (typeof code !== 'string' || typeof chars !== 'number') return null;
  if (typeof pieceCount !== 'number' || typeof ratioTenths !== 'number') return null;
  if (!Array.isArray(pieces)) return null;
  const list = pieces.filter((piece): piece is string => typeof piece === 'string');
  return { code, chars, pieces: list, pieceCount, ratioTenths };
}

function readDone(
  payload: unknown,
): { baseCode: string; minCount: number; maxCount: number } | null {
  const p = asRecord(payload);
  if (p === null) return null;
  const { baseCode, minCount, maxCount } = p;
  if (typeof baseCode !== 'string') return null;
  if (typeof minCount !== 'number' || typeof maxCount !== 'number') return null;
  return { baseCode, minCount, maxCount };
}

export const tokensPerLanguageProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as TokensPerLanguageStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'vocab-learned': {
          const v = readVocab(event.payload);
          if (v === null) return;
          stage.setCaption(
            tr(
              'caption.vocab',
              'A vocabulary learned from English words only — words: {words}, vocabulary pieces: {n}.',
              { words: v.corpusWords, n: v.tokens.length },
            ),
          );
          await stage.showVocab(v);
          return;
        }
        case 'sentences-shown': {
          stage.setCaption(tr('caption.sentences', 'These sentences all mean the same thing.'));
          await stage.showSentences();
          return;
        }
        case 'scatter': {
          const v = readScatter(event.payload);
          if (v === null) return;
          stage.setCaption(
            tr('caption.scatter', 'Cut with that vocabulary — letters: {chars}, pieces: {pieces}.', {
              chars: v.chars,
              pieces: v.pieceCount,
            }),
          );
          await stage.scatter(v);
          return;
        }
        case 'done': {
          const v = readDone(event.payload);
          if (v === null) return;
          stage.setCaption(
            tr(
              'caption.done',
              'Same meaning, similar length. Pieces — fewest: {min}, most: {max}.',
              { min: v.minCount, max: v.maxCount },
            ),
          );
          await stage.markContrast(v.baseCode);
          return;
        }
        case 'rewind': {
          stage.reset();
          return;
        }
        default:
          // 이 조각이 내보내는 것은 위 다섯뿐이다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.reset();
    },
  };
};
