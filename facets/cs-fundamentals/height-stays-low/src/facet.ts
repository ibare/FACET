/**
 * HeightStaysLow facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "가지 하나가 자식을 몇 개씩 두느냐가 왜 나무 높이를 정하는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 + 한 걸음 둘) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭은 러너가 정함(PIECE_CANVAS_W) / 전제는 이 글이 밝힌다.
 *
 * 데이터는 실측이 아니라 계산이다 — 자식 수(2, 100)와 목표 잎 수(1,000,000)만
 * 선언하고, 몇 층을 내려가야 하는지는 algorithm 이 실제로 곱해 나가며 찾는다
 * (호스트가 미리 확정한 값: 자식 2개는 21층, 자식 100개는 4층).
 *
 * title / description / messages 는 en·ko 만 채웠다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const heightStaysLowFacet: FacetJson = {
  id: 'facet:heightStaysLow',
  title: { en: 'Height Stays Low', ko: '낮은 트리 높이' },
  description: {
    en: 'Two trees cover the same million leaves — the wider one finishes in far fewer levels',
    ko: '같은 백만 개의 잎을 두 나무가 덮는다 — 가지가 넓은 쪽이 훨씬 적은 층으로 끝난다',
  },
  algorithm: 'module:heightStaysLow',
  projector: 'module:heightStaysLowProjector',
  initialData: {
    type: 'height-stays-low',
    algorithmLabel: 'level walk',
    // 호스트가 확정한 실측값. 자식 수 둘과 목표 잎 수만 선언하고, 층수는
    // algorithm 이 곱해 나가며 계산한다 — 21층(자식 2개) / 4층(자식 100개).
    target: 1_000_000,
    branchA: 2,
    branchB: 100,
    stepMs: 700,
  },
  shuffleOnReset: false,
  messages: {
    'caption.goal': {
      en: 'Both trees have to cover the same {target} leaves.',
      ko: '두 나무 모두 같은 {target}장의 잎을 덮어야 한다.',
    },
    'caption.result': {
      en: '{a} levels down on one side, {b} on the other — same leaves, same walk to read.',
      ko: '한쪽은 {a} 층, 다른 쪽은 {b} 층 — 같은 잎을 덮는데도 밟는 걸음이 다르다.',
    },
  },
  blocks: {
    stage: { type: 'height-stays-low-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
