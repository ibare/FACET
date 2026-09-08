/**
 * pivot-choice-matters facet JSON.
 *
 * @piece 조각 — 질문 하나에 답하고 멈춘다 (S-piece).
 *   "기준을 어디서 고르느냐가 남는 일의 크기를 정하는가?"
 *
 * 같은 값들을 두 가지 기준으로 각각 한 번씩 가르고, 두 결과를 한 화면에 남겨
 * 견주게 한다. 컨트롤은 다시 보기와 한 걸음 — 둘 다 눌러야 완성되는 조작이
 * 아니다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const pivotChoiceMattersFacet: FacetJson = {
  id: 'facet:pivotChoiceMatters',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'Pivot choice',
    ko: '피벗 선택',
  },
  description: {
    en: 'Splitting the same sorted values twice: the middle value halves the work, the first value removes one.',
    ko: '이미 줄이 선 같은 값들을 두 번 가른다. 가운데 값은 일을 반으로 줄이고, 맨 앞 값은 하나만 줄인다.',
  },
  algorithm: 'module:pivotChoiceMatters',
  projector: 'module:pivotChoiceMattersProjector',
  initialData: {
    type: 'pivot-choice-matters',
    // 이미 줄이 선 입력. 셔플하면 이 조각의 전제가 사라지므로 shuffleOnReset 은 켜지 않는다.
    values: [1, 2, 3, 4, 5, 6, 7],
    // 같은 값들을 두 가지 기준으로 — 가운데 값(4), 그다음 맨 앞 값(1).
    trials: [{ pivotIndex: 3 }, { pivotIndex: 0 }],
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'pivot-choice-matters-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.pickMiddle': {
      en: 'Take the middle value {pivot} as the pivot.',
      ko: '가운데 값 {pivot} 을 기준으로 삼는다.',
    },
    'caption.pickFirst': {
      en: 'Now take the first value {pivot} as the pivot — the input is already sorted.',
      ko: '이번엔 맨 앞 값 {pivot} 을 기준으로 삼는다. 입력은 이미 줄이 서 있다.',
    },
    'caption.splitEven': {
      en: '{left} slide left, {right} slide right. The beam stays level.',
      ko: '{left} 개는 왼쪽, {right} 개는 오른쪽. 저울대가 수평으로 멎는다.',
    },
    'caption.pileOneSide': {
      en: 'Nothing is smaller than {pivot} — all {loaded} pile onto one side.',
      ko: '{pivot} 보다 작은 값이 없다. {loaded} 개가 모두 한쪽으로 쏠린다.',
    },
    'caption.workHalved': {
      en: 'The biggest part left holds {remaining} of {total} — the work halved.',
      ko: '남는 일은 {total} 중 {remaining}. 일이 반으로 줄었다.',
    },
    'caption.workBarelySmaller': {
      en: 'The biggest part left holds {remaining} of {total} — only the pivot is gone.',
      ko: '남는 일은 {total} 중 {remaining}. 기준 하나가 빠졌을 뿐이다.',
    },
  },
};
