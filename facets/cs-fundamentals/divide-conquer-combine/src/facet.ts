/**
 * divideConquerCombine facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "쪼개는 것과 합치는 것이 어떻게 한 절차인가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음 / 제목 없음 / 한 주장 / 메트릭 없음 / layout 없음 /
 * 캔버스 폭은 러너가 PIECE_CANVAS_W 로 정한다.
 *
 * 걸음 순서가 논증이다. 문제 하나를 세우고(1걸음), 답 없이 갈라져 내려가고
 * (3걸음), 바닥에서 방향이 바뀌고(1걸음), 되짚어 오르며 답이 생기고(3걸음),
 * 맨 처음 자른 자리가 맨 마지막에 합쳐진 것을 남긴다(1걸음). 합침부터 보이면
 * 무엇이 되짚어 오르는 것인지 알 수 없다.
 *
 * 화면에 뜨는 쪼갬/합침 횟수는 algorithm 의 `computeDivideConquerCombinePlan` 이
 * 실제로 센 값이다 — 선언에 박아 둔 수가 아니다 (S-piece).
 *
 * title / description / messages 는 en·ko 만 채웠다 (조각 방식).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const divideConquerCombineFacet: FacetJson = {
  id: 'facet:divideConquerCombine',
  title: { en: 'Divide and Conquer', ko: '분할 정복' },
  description: {
    en: 'Splitting goes down and answers come back up — the same places, in reverse order',
    ko: '쪼개어 내려가고 답이 되어 올라온다 — 같은 자리를 거꾸로 되짚는다',
  },
  algorithm: 'module:divideConquerCombine',
  projector: 'module:divideConquerCombineProjector',
  initialData: {
    type: 'divide-conquer-combine',
    values: [3, 1, 4, 2],
    stepMs: 750,
  },
  // 자를 자리와 되짚는 순서가 이 조각의 주장이라 매번 같은 값으로 보인다.
  shuffleOnReset: false,
  messages: {
    'caption.problem': {
      en: 'One problem: put these values in order.',
      ko: '문제 하나 — 이 값들을 줄 세운다.',
    },
    'caption.splitRoot': {
      en: 'Cut it in half. No answer yet — just a smaller problem.',
      ko: '반으로 자른다. 아직 답은 없고 더 작은 문제만 생긴다.',
    },
    'caption.split': {
      en: 'Cut again. Still going down.',
      ko: '또 자른다. 아직 내려가는 중이다.',
    },
    'caption.bottom': {
      en: 'A single value is already an answer. The bottom turns the trip around.',
      ko: '값 하나는 그 자체로 답이다. 바닥에서 방향이 바뀐다.',
    },
    'caption.merge': {
      en: 'The layer that was cut later is combined first.',
      ko: '늦게 잘린 층이 먼저 합쳐진다.',
    },
    'caption.mergeRoot': {
      en: 'The place cut first is combined last — only now is there one whole answer.',
      ko: '맨 처음 자른 자리가 맨 마지막에 합쳐진다. 이제야 온전한 답이 하나 있다.',
    },
    'caption.done': {
      en: '{splits} cuts going down, {merges} combines coming up — the same places, in reverse.',
      ko: '내려가며 {splits}번 자르고 올라오며 {merges}번 합쳤다 — 같은 자리를 거꾸로 되짚은 것이다.',
    },
  },
  blocks: {
    stage: { type: 'divide-conquer-combine-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
