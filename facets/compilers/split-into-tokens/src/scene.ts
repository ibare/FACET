/**
 * split-into-tokens 장면.
 *
 * 바탕 — 원문 글자 줄 (initial 이 initialData 에서 베낀다)
 * 자취 — 지금까지 끊은 덩이 (토큰 · 빈칸 덩이, 끊은 차례)
 * 이번 걸음 — 방금 끊은 덩이의 번호와 갈래
 *
 * 셈(최장 일치)은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SplitChunk = { from: number; to: number; kind: string | null };

export type SplitStep =
  | { kind: 'start' }
  | { kind: 'cut'; index: number }
  | { kind: 'drop'; index: number };

export type SplitScene = {
  source: string;
  chunks: SplitChunk[];
  step: SplitStep;
};

function readSource(initialData: unknown): string {
  if (typeof initialData !== 'object' || initialData === null) {
    throw new Error('split-into-tokens 장면: initialData 가 없다');
  }
  const s = (initialData as { source?: unknown }).source;
  if (typeof s !== 'string' || s === '') {
    throw new Error('split-into-tokens 장면: initialData.source 가 글자 줄이 아니다');
  }
  return s;
}

function readSpan(payload: unknown, sceneLen: number, at: number): { from: number; to: number } {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('split-into-tokens 장면: payload 가 없다');
  }
  const from = (payload as { from?: unknown }).from;
  const to = (payload as { to?: unknown }).to;
  if (typeof from !== 'number' || typeof to !== 'number') {
    throw new Error('split-into-tokens 장면: from · to 가 수가 아니다');
  }
  if (from !== at || to <= from || to > sceneLen) {
    throw new Error(`split-into-tokens 장면: 덩이 [${from},${to}) 가 자리 ${at} 에서 이어지지 않는다`);
  }
  return { from, to };
}

export const splitIntoTokensScene: ScenePlan<SplitScene> = {
  initial(initialData: unknown): SplitScene {
    return { source: readSource(initialData), chunks: [], step: { kind: 'start' } };
  },
  reduce(scene: SplitScene, event: FacetRuntimeEvent): SplitScene {
    const at = scene.chunks.length > 0 ? scene.chunks[scene.chunks.length - 1]!.to : 0;
    if (event.type === 'cut') {
      const span = readSpan(event.payload, scene.source.length, at);
      const kind = (event.payload as { kind?: unknown }).kind;
      if (typeof kind !== 'string' || kind === '') {
        throw new Error('split-into-tokens 장면: cut 의 kind 가 없다');
      }
      const chunks = [...scene.chunks, { from: span.from, to: span.to, kind }];
      return { source: scene.source, chunks, step: { kind: 'cut', index: chunks.length - 1 } };
    }
    if (event.type === 'drop') {
      const span = readSpan(event.payload, scene.source.length, at);
      const chunks = [...scene.chunks, { from: span.from, to: span.to, kind: null }];
      return { source: scene.source, chunks, step: { kind: 'drop', index: chunks.length - 1 } };
    }
    throw new Error(`split-into-tokens 장면: 모르는 이벤트 '${event.type}'`);
  },
};
