/**
 * RecolorThenRotate facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "빨강 아래 빨강이 걸렸을 때, 색만 바꿔 풀릴 때와 돌려야 풀릴 때를 가르는
 *   것은 무엇인가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 데이터는 20, 10, 30, 5, 3 을 이 순서로 넣는 실제 삽입이다 — 미리 계산해 둔
 * 스냅샷이 아니라 algorithm 이 진짜 레드-블랙 트리 삽입+수선을 수행한다.
 * `shuffleOnReset` 은 반드시 false — 순서가 바로 이 논증의 재료다 (5는 첫
 * 위반을 색칠로, 3은 두 번째 위반을 회전으로 풀게 만드는 것이 이 순서다).
 *
 * title / description / messages 는 en·ko 만 채웠다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const recolorThenRotateFacet: FacetJson = {
  id: 'facet:recolorThenRotate',
  title: { en: 'Recolor, Then Rotate', ko: '재색칠과 회전' },
  description: {
    en: 'The same violation happens twice — the color next door decides whether recoloring is enough or the tree must turn',
    ko: '같은 위반이 두 번 일어난다 — 옆자리의 색이 색칠로 끝날지 돌아야 할지를 가른다',
  },
  algorithm: 'module:recolorThenRotate',
  projector: 'module:recolorThenRotateProjector',
  initialData: {
    type: 'recolor-then-rotate',
    values: [20, 10, 30, 5, 3],
    stepMs: 600,
  },
  shuffleOnReset: false,
  messages: {
    'caption.insertRoot': {
      en: '{value} starts the tree — the root is always black.',
      ko: '{value}이 트리를 시작한다 — 뿌리는 항상 검정이다.',
    },
    'caption.insertRed': {
      en: '{value} enters red, under {parent}.',
      ko: '{value}이 {parent} 아래 빨강으로 들어온다.',
    },
    'caption.violationRed': {
      en: '{child} lands red under red {parent}. Its sibling {uncle} is red too — recoloring will settle it.',
      ko: '{parent} 아래 {child} — 또 빨강 아래 빨강이다. 옆자리 {uncle}도 빨강이니 색칠로 풀린다.',
    },
    'caption.violationNil': {
      en: '{child} lands red under red {parent}, and the empty spot beside {parent} counts as black — recoloring alone will not fix this.',
      ko: '{parent} 아래 {child} — 또 빨강 아래 빨강이다. {parent} 옆 빈 자리는 검정이라 색칠만으로는 안 풀린다.',
    },
    'caption.recolorApplied': {
      en: '{parent} and {uncle} turn black, {grandparent} turns red.',
      ko: '{parent}와 {uncle}은 검정으로, {grandparent}는 빨강으로 바뀐다.',
    },
    'caption.rootFixApplied': {
      en: '{root} is the root, so it turns back to black.',
      ko: '{root}는 뿌리라서 다시 검정이 된다.',
    },
    'caption.rotateApplied': {
      en: '{grandparent} rotates — {parent} moves up in its place.',
      ko: '{grandparent}가 돈다 — {parent}가 그 자리로 올라온다.',
    },
    'caption.rotateSwapApplied': {
      en: '{parent} turns black, {grandparent} turns red.',
      ko: '{parent}는 검정으로, {grandparent}는 빨강으로 바뀐다.',
    },
  },
  blocks: {
    stage: { type: 'recolor-then-rotate-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
