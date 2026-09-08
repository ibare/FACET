/**
 * push-pop-top — LIFO 조각 (piece) 의 선언.
 *
 * @piece 질문 하나에만 답한다 — "드나드는 문이 하나뿐이면 무슨 일이 벌어지는가".
 *
 * 완결형 자료구조 facet 이 아니다. 제목도 메트릭도 두지 않는다. 제목은 글의
 * 문단이 주고, 조각은 셀 것이 없다 (S-piece). 컨트롤은 다시 보기와 한 걸음
 * 둘뿐이며 둘 다 눌러야 완성되는 조작이 아니다 — 자동 재생만 보고 지나가도
 * 화면은 할 말을 마친다.
 *
 * 화면에 뜨는 문안은 전부 여기 `messages` 에 있다. projector 와 stage 에는 키만
 * 남는다 (C10).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const pushPopTopFacet: FacetJson = {
  id: 'facet:pushPopTop',
  title: { en: 'Push, pop, top', ko: '넣기 · 빼기 · 꼭대기' },
  description: {
    en: 'One opening: the value that went in last is the one that comes out first.',
    ko: '문이 하나뿐이면 마지막에 들어온 것이 먼저 나온다.',
  },
  algorithm: 'module:pushPopTop',
  projector: 'module:pushPopTopProjector',
  initialData: {
    type: 'push-pop-top',
    /** 넣는 차례. 마지막 값이 꼭대기가 된다. */
    pushes: [3, 7, 1],
    /** 가운데 값 7 의 자리. 위가 걷히기 전에는 꺼낼 수 없음을 여기서 보인다. */
    buriedSlot: 1,
    /** 걸음 간격 — 읽을 시간을 주는 것도 저작 결정이다. */
    stepMs: 460,
    /** 곱씹어야 하는 걸음 (막힘 · 길이 열림) 뒤에 더 머무는 시간. */
    holdMs: 900,
  },
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage' }, { ref: 'controls' }],
  },
  blocks: {
    stage: { type: 'push-pop-top-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.oneOpening': {
      en: 'One opening. Everything enters and leaves through this end.',
      ko: '열린 곳은 한쪽 끝뿐이다. 넣는 것도 빼는 것도 이 문으로만 다닌다.',
    },
    'caption.push': {
      en: 'Push {value} — it lands on top, and top rises to {top}.',
      ko: '{value} 넣기. 꼭대기에 얹히고 top 이 {top} 까지 오른다.',
    },
    'caption.blocked': {
      en: '{value} is buried under {blocker}. No hand reaches past the top.',
      ko: '{blocker} 밑에 깔린 {value}. 꼭대기를 건너뛰고 들어가는 손은 없다.',
    },
    'caption.pop': {
      en: 'Pop {value} — only the top may leave, so top falls to {top}.',
      ko: '{value} 빼기. 나갈 수 있는 것은 꼭대기뿐이라 top 이 {top} 까지 내린다.',
    },
    'caption.popUnblocked': {
      en: 'Now {value} is the top. It became reachable only after {blocker} left.',
      ko: '이제 꼭대기는 {value}. 위에 얹혀 있던 {blocker} 부터 걷어 내야 손이 닿는다.',
    },
    'caption.lifo': {
      en: 'Last in, first out — the order out is the order in, reversed.',
      ko: '마지막에 들어온 것이 먼저 나온다. 나간 차례는 들어온 차례를 뒤집은 것이다.',
    },
  },
};
