/**
 * digit-by-digit facet 선언.
 *
 * @piece 조각(piece) — "한 자리만 봐서 어떻게 전체가 정렬되나" 하나에만 답한다.
 *
 * header 도 metrics 도 layout 도 두지 않는다 (S-piece). 화면에 뜨는 문안은 전부
 * 아래 messages 에 있고 코드에는 키만 남는다 (C10).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const digitByDigitFacet: FacetJson = {
  id: 'facet:digitByDigit',
  title: { en: 'Digit-by-digit sort', ko: '자릿수 정렬' },
  description: {
    en: 'One digit at a time, lowest place first — and the whole row ends up sorted.',
    ko: '낮은 자리부터 한 자리씩만 본다. 그런데 마치면 줄 전체가 서 있다.',
  },
  algorithm: 'module:digitByDigit',
  projector: 'module:digitByDigitProjector',
  initialData: {
    type: 'digit-by-digit',
    values: [170, 45, 75, 90],
    // 걸음 사이에 두는 읽을 시간. stage 의 이동 애니메이션이 이 위에 더해진다.
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'digit-by-digit-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.start': {
      en: '{count} numbers, out of order — and not one of them gets compared.',
      ko: '수 {count}개가 뒤죽박죽 — 그리고 서로 견주는 일은 한 번도 없다.',
    },
    'caption.focus': {
      en: 'Pass {round} of {total} — only the {place}s digit is read.',
      ko: '{total}번 중 {round}번째 라운드 — {place}의 자리만 읽는다.',
    },
    'caption.scatter': {
      en: 'Each number drops into the bin its {place}s digit names.',
      ko: '각 수가 {place}의 자리 숫자가 가리키는 통으로 내려간다.',
    },
    'caption.gather': {
      en: 'Bins are read 0 to 9; inside a bin the earlier order is kept.',
      ko: '통을 0부터 9까지 읽어 올린다. 한 통 안에서는 앞 순서를 그대로 지킨다.',
    },
    'caption.done': {
      en: '{rounds} passes, zero comparisons — the row is in order.',
      ko: '라운드 {rounds}회, 견줌 0회 — 줄이 다 섰다.',
    },
    'label.placeTag': {
      en: '{place}s place',
      ko: '{place}의 자리',
    },
  },
};
