/**
 * memoWriteOnce 의 선언.
 *
 * @piece 조각(piece) facet — 질문 하나에 답하고 멈춘다 (S-piece).
 *   묻는 것: 적어 두면 왜 빨라지는가.
 *   답: 답을 얻은 항은 표로 옮겨 가 적히고, 같은 항을 다시 만나면 표에서
 *       되돌아 나온다. 그 자리에서 가지는 더 뻗지 않는다.
 *
 * 제목 블록도 메트릭도 두지 않는다. 배치는 러너가 만든다.
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const memoWriteOnceFacet: FacetJson = {
  id: 'facet:memoWriteOnce',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'Memoization', ko: '메모이제이션' },
  description: {
    en: 'A solved term moves into the table; meeting it again reads the value back instead of branching.',
    ko: '푼 항은 표로 옮겨 가 적히고, 다시 만나면 뻗는 대신 표에서 값을 읽는다.',
  },
  algorithm: 'module:memoWriteOnce',
  projector: 'module:memoWriteOnceProjector',
  initialData: {
    type: 'memo-write-once',
    n: 5,
    stepMs: 460,
  },
  blocks: {
    stage: { type: 'memo-write-once-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.call': {
      en: 'Call f({n}).',
      ko: 'f({n}) 을 부른다.',
    },
    'caption.write': {
      en: 'f({n}) = {value}. Write it into memo[{n}].',
      ko: 'f({n}) = {value} — memo[{n}] 에 적는다.',
    },
    'caption.read': {
      en: 'f({n}) is already written — read {value}, branch no further.',
      ko: 'f({n}) 은 이미 적혀 있다 — {value} 를 읽고 더 뻗지 않는다.',
    },
    'caption.done': {
      en: '{solved} terms solved, {reused} read back from memo. f({n}) = {value}.',
      ko: '푼 항 {solved}, 표에서 읽은 항 {reused}. f({n}) = {value}.',
    },
  },
};
