/**
 * BlackHeightEqual facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "어느 길로 가도 검은 수가 같다는 게 무슨 뜻인가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭은 러너가 정함(PIECE_CANVAS_W) / 전제를 각주로
 * 밝히지 않음.
 *
 * 데이터는 호스트가 준 실측 트리 그대로다 — 성한 레드-블랙 트리이며,
 * 20(검) 아래 10(검)·40(빨), 10 아래 5(빨), 40 아래 30(검)·50(검). 뿌리
 * 20 자신은 세지 않고 그 아래 네 길(20→10→5→nil, 20→10→nil, 20→40→30→nil,
 * 20→40→50→nil)을 실제로 따라 내려가며 센다 — 길이는 2 또는 3으로 다르지만
 * 검은 수는 넷 다 2다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const blackHeightEqualFacet: FacetJson = {
  id: 'facet:blackHeightEqual',
  title: { en: 'Black Height, Equal Every Time', ko: '검은 높이는 어디서나 같다' },
  description: {
    en: 'Walk root to nil on four different routes — the black count always lands on the same number',
    ko: '뿌리에서 nil 까지 네 갈래 길을 따라가 본다 — 검은 수는 언제나 같은 값에 닿는다',
  },
  algorithm: 'module:blackHeightEqual',
  projector: 'module:blackHeightEqualProjector',
  initialData: {
    type: 'black-height-equal',
    root: {
      id: '20',
      value: 20,
      color: 'black',
      left: {
        id: '10',
        value: 10,
        color: 'black',
        left: {
          id: '5',
          value: 5,
          color: 'red',
        },
      },
      right: {
        id: '40',
        value: 40,
        color: 'red',
        left: {
          id: '30',
          value: 30,
          color: 'black',
        },
        right: {
          id: '50',
          value: 50,
          color: 'black',
        },
      },
    },
    stepMs: 700,
  },
  shuffleOnReset: false,
  messages: {
    'caption.visitBlack': {
      en: 'Black — count it. Running total {n}.',
      ko: '검은 자리 — 센다. 지금까지 {n}.',
    },
    'caption.visitRed': {
      en: 'Red — skip it. Running total stays {n}.',
      ko: '빨간 자리 — 건너뛴다. 지금까지 {n}.',
    },
    'caption.visitNil': {
      en: 'Nil — always counts as black. Running total {n}.',
      ko: '빈 자리(nil) — 검정으로 센다. 지금까지 {n}.',
    },
    'caption.settled': {
      en: 'This path settles at {n} black.',
      ko: '이 길은 검은 수 {n}로 끝난다.',
    },
    'caption.allSettled': {
      en: 'Every path settles at the same number — {n} black.',
      ko: '어느 길로 가도 검은 수는 같다 — {n}.',
    },
    'caption.rewind': {
      en: 'Back to the root — watching it again, one step at a time.',
      ko: '뿌리로 되감는다 — 한 걸음씩 다시 짚어 본다.',
    },
  },
  blocks: {
    stage: { type: 'black-height-equal-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
