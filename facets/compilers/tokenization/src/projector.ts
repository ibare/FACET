/**
 * Tokenization facet projector — algorithm 이벤트를 tokenization-stage view 메서드로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 좌→우 응시 + 자라나는 구간 박스 — 응시 표식이 한 글자씩 전진하며 같은
 *      종류 글자들이 색 구간으로 길어진다 (extend / pending).
 *   2. 닫힘과 토큰 카드 떨어짐 — 구간이 닫혀 출력 행 끝에 카드 1장 안착, 띠 →
 *      카드 낙하 궤적이 한 컷 떠오른다 (commit).
 *   3. 공백·주석 삼킴 흔적 — 회색 반투명으로 띠 위에 가라앉는다 (swallow).
 *   4. 최장 일치 망설임 — pending 박자에 점선 테두리가 잠시 떴다가 굳는다.
 *   5. 식별자 → 키워드 라벨 교체 — 직전 카드의 상단 띠 색·라벨이 페이드 전환
 *      (promote).
 *   6. 오류 빨간 카드 — 빨간 카드 1장 + 응시 다음 시작점 점프 (error).
 *
 * 컨트롤바 버튼은 onAction 으로 받아 mechanism.dispatch 로 그대로 통과한다 —
 * runner 가 자동 wire-up 하므로 projector 는 view 메서드 호출만 담당한다.
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import type {
  KindPalette,
  SwallowKind,
  Token,
  TokenizationExample,
  TokenKind,
} from './algorithm.js';

type Segment = { start: number; end: number; kind: TokenKind };

type StageView = {
  reset(): void;
  init(payload: {
    source: string;
    exampleIndex: number;
    exampleName: { en: string; ko: string };
    examples: { id: string; name: { en: string; ko: string } }[];
    kindPalette: KindPalette;
  }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  applyExtend(payload: { gaze: number; segment: Segment }): Promise<void>;
  applyPending(payload: { gaze: number; segment: Segment }): Promise<void>;
  applySwallow(payload: {
    gaze: number;
    swallowedRange: { start: number; end: number };
    kind: SwallowKind;
  }): Promise<void>;
  applyCommit(payload: {
    tokenIndex: number;
    token: Token;
    gaze: number;
  }): Promise<void>;
  applyPromote(payload: {
    tokenIndex: number;
    fromKind: TokenKind;
    toKind: TokenKind;
  }): Promise<void>;
  applyError(payload: {
    tokenIndex: number;
    token: Token;
    gaze: number;
  }): Promise<void>;
  applyDone(payload: { gaze: number; totalTokens: number }): void;
  signalExampleSet(payload: {
    exampleIndex: number;
    exampleName: { en: string; ko: string };
    source: string;
  }): void;
  signalInvalid(op: string, raw: string): void;
};

const BASE_CAPTION =
  '토큰화는 컴파일러의 첫 단계다. 사람이 쓴 소스 문자열을 좌에서 우로 한 글자씩 읽어 의미 있는 최소 단위로 끊는다. 더 길게 묶을 수 있으면 더 길게 묶고, 공백과 주석은 흔적으로만 남는다.';

export const tokenizationProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as StageView | undefined;

  function speedDiv(): number {
    return Math.max(0.01, runtime?.getSpeed() ?? 1);
  }

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },

    async onEvent(event) {
      if (!stage) return;
      const div = speedDiv();
      void div;

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as Partial<{
            source: string;
            exampleIndex: number;
            exampleName: { en: string; ko: string };
            examples: { id: string; name: { en: string; ko: string } }[];
            kindPalette: KindPalette;
          }>;
          stage.init({
            source: typeof p.source === 'string' ? p.source : '',
            exampleIndex: typeof p.exampleIndex === 'number' ? p.exampleIndex : 0,
            exampleName: p.exampleName ?? { en: '', ko: '' },
            examples: Array.isArray(p.examples) ? p.examples : [],
            kindPalette: (p.kindPalette ?? {}) as KindPalette,
          });
          break;
        }

        case 'extend': {
          const p = (event.payload ?? {}) as Partial<{
            gaze: number;
            segment: Segment;
          }>;
          if (!p.segment) break;
          await stage.applyExtend({
            gaze: typeof p.gaze === 'number' ? p.gaze : 0,
            segment: p.segment,
          });
          break;
        }

        case 'pending': {
          const p = (event.payload ?? {}) as Partial<{
            gaze: number;
            segment: Segment;
          }>;
          if (!p.segment) break;
          await stage.applyPending({
            gaze: typeof p.gaze === 'number' ? p.gaze : 0,
            segment: p.segment,
          });
          break;
        }

        case 'swallow': {
          const p = (event.payload ?? {}) as Partial<{
            gaze: number;
            swallowedRange: { start: number; end: number };
            kind: SwallowKind;
          }>;
          if (!p.swallowedRange) break;
          await stage.applySwallow({
            gaze: typeof p.gaze === 'number' ? p.gaze : 0,
            swallowedRange: p.swallowedRange,
            kind: p.kind === 'comment' ? 'comment' : 'whitespace',
          });
          break;
        }

        case 'commit': {
          const p = (event.payload ?? {}) as Partial<{
            tokenIndex: number;
            token: Token;
            gaze: number;
          }>;
          if (!p.token) break;
          await stage.applyCommit({
            tokenIndex: typeof p.tokenIndex === 'number' ? p.tokenIndex : 0,
            token: p.token,
            gaze: typeof p.gaze === 'number' ? p.gaze : 0,
          });
          break;
        }

        case 'promote': {
          const p = (event.payload ?? {}) as Partial<{
            tokenIndex: number;
            fromKind: TokenKind;
            toKind: TokenKind;
          }>;
          await stage.applyPromote({
            tokenIndex: typeof p.tokenIndex === 'number' ? p.tokenIndex : 0,
            fromKind: (p.fromKind ?? 'identifier') as TokenKind,
            toKind: (p.toKind ?? 'keyword') as TokenKind,
          });
          break;
        }

        case 'error': {
          const p = (event.payload ?? {}) as Partial<{
            tokenIndex: number;
            token: Token;
            gaze: number;
          }>;
          if (!p.token) break;
          await stage.applyError({
            tokenIndex: typeof p.tokenIndex === 'number' ? p.tokenIndex : 0,
            token: p.token,
            gaze: typeof p.gaze === 'number' ? p.gaze : 0,
          });
          break;
        }

        case 'done': {
          const p = (event.payload ?? {}) as Partial<{
            gaze: number;
            totalTokens: number;
          }>;
          stage.applyDone({
            gaze: typeof p.gaze === 'number' ? p.gaze : 0,
            totalTokens: typeof p.totalTokens === 'number' ? p.totalTokens : 0,
          });
          break;
        }

        case 'example-set': {
          const p = (event.payload ?? {}) as Partial<{
            exampleIndex: number;
            exampleName: { en: string; ko: string };
            source: string;
          }>;
          stage.signalExampleSet({
            exampleIndex: typeof p.exampleIndex === 'number' ? p.exampleIndex : 0,
            exampleName: p.exampleName ?? { en: '', ko: '' },
            source: typeof p.source === 'string' ? p.source : '',
          });
          break;
        }

        case 'invalid-input': {
          const p = (event.payload ?? {}) as { op?: string; raw?: string };
          stage.signalInvalid(String(p.op ?? ''), String(p.raw ?? ''));
          break;
        }

        default:
          // phase 등 silent 메타 — 의도적 drop.
          break;
      }
    },

    onReset() {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },
  };
};

// 사용처 표시 — algorithm.ts 의 export 와 정합 검증용 import.
export type { TokenizationExample };
