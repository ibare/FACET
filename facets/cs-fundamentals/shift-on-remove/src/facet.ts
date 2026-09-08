/**
 * @piece 삭제 이동 — 가운데를 빼면 뒤가 당겨진다.
 *
 * 조각(piece) facet. 한 주장만 말하고 멈춘다 (S-piece).
 *   - 제목 블록 없음 — 제목은 글의 문단이 준다.
 *   - 메트릭 없음 — 셀 것이 없다.
 *   - 컨트롤은 다시 보기와 한 걸음 둘뿐이며, 둘 다 눌러야 완성되는 조작이 아니다.
 *     아무것도 누르지 않아도 화면은 스스로 재생해 할 말을 마친다.
 *
 * 실측 전제 — values / removeIndex 가 화면의 모든 수의 출처다.
 *   [10, 20, 30, 40, 50] 에서 인덱스 1(값 20) 을 빼면
 *   30 → 1번, 40 → 2번, 50 → 3번 으로 앞에서부터 세 번 옮겨지고
 *   결과는 [10, 30, 40, 50], 쓰는 칸은 4개, 4번 칸은 더 쓰이지 않는다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const shiftOnRemoveFacet: FacetJson = {
  id: 'facet:shiftOnRemove',
  title: { en: 'Shift on remove', ko: '삭제 이동' },
  description: {
    en: 'Take one out of the middle and everything behind it is pulled left.',
    ko: '가운데를 빼면 뒤가 당겨진다.',
  },
  algorithm: 'module:shiftOnRemove',
  projector: 'module:shiftOnRemoveProjector',
  initialData: {
    type: 'shift-on-remove',
    values: [10, 20, 30, 40, 50],
    removeIndex: 1,
    stepMs: 900,
  },
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage' }, { ref: 'controls' }],
  },
  blocks: {
    stage: { type: 'shift-on-remove-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.intact': {
      en: 'An array holds its values in a row with no gaps.',
      ko: '배열은 값을 빈틈없이 한 줄로 둔다.',
    },
    'caption.remove': {
      en: 'Remove index {index}. That slot is now empty.',
      ko: '인덱스 {index} 자리를 뺀다. 그 칸이 빈다.',
    },
    'caption.pull': {
      en: 'Pull from the front, or a value would be overwritten.',
      ko: '빈 칸 바로 뒤부터 당긴다. 뒤에서 시작하면 값이 덮인다.',
    },
    'caption.result': {
      en: '{moved} values shifted one slot left. The tail slot is no longer used.',
      ko: '값 {moved}개가 한 칸씩 당겨졌다. 끝 칸은 더 쓰이지 않는다.',
    },
    'label.used': { en: 'in use: {n}', ko: '쓰는 칸 {n}' },
    'label.unused': { en: 'unused', ko: '안 씀' },
  },
};
