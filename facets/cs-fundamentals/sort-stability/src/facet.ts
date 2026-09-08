/**
 * sort-stability 선언.
 *
 * @piece 질문 하나 — **값이 같은 둘의 앞뒤 순서가 정렬 뒤에도 지켜지는가.**
 *
 * 데이터는 이름표를 단 항목 넷이다. 값만으로 줄 세우면 1 · 1 · 3 · 3 이지만
 * 결과는 하나가 아니다 — 안정된 쪽은 A D B C, 맞바꿈으로 최솟값을 앞으로 보내는
 * 선택 정렬은 A D C B 가 되고, 두 결과는 값이 같은 3 끼리 한 짝에서만 어긋난다.
 * 이 어긋남은 값으로 보이지 않으므로 화면이 이름표를 들고 있어야 한다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const sortStabilityFacet: FacetJson = {
  id: 'facet:sortStability',
  title: { en: 'Sort stability', ko: '정렬 안정성' },
  description: {
    en: 'Equal values leave more than one correct sorted order. Only the one that keeps the input order is stable.',
    ko: '값이 같은 항목이 있으면 옳은 정렬 결과는 하나가 아니다. 그중 입력 순서를 지키는 것만 안정이라 부른다.',
  },
  algorithm: 'module:sortStability',
  projector: 'module:sortStabilityProjector',
  initialData: {
    type: 'sort-stability',
    items: [
      { label: 'B', value: 3 },
      { label: 'A', value: 1 },
      { label: 'C', value: 3 },
      { label: 'D', value: 1 },
    ],
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'sort-stability-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.input': {
      en: 'Four items. Each carries a name tag and a value.',
      ko: '항목 넷. 저마다 이름표와 값을 지닌다.',
    },
    'caption.stable': {
      en: 'Stable sort — items of equal value keep their input order.',
      ko: '안정 정렬 — 값이 같은 항목은 입력 순서를 지킨다.',
    },
    'caption.selection': {
      en: 'Selection sort — swap the smallest one to the front.',
      ko: '선택 정렬 — 최솟값을 맞바꿔 앞으로 보낸다.',
    },
    'caption.tagsHidden': {
      en: 'Hide the name tags and the two rows read exactly the same.',
      ko: '이름표를 접으면 두 줄이 똑같이 읽힌다.',
    },
    'caption.linkOrigin': {
      en: 'Link each item to where it came from: one pair crosses.',
      ko: '항목마다 어디서 왔는지를 이으면 한 짝만 어긋난다.',
    },
    'caption.mismatch': {
      en: 'Only the top row kept the input order of the two {value}s — that is stability.',
      ko: '값이 {value} 인 둘의 입력 순서를 지킨 것은 위 줄뿐이다 — 그것이 안정이다.',
    },
    'label.rowInput': { en: 'input', ko: '입력' },
    'label.rowStable': { en: 'stable sort', ko: '안정 정렬' },
    'label.rowSelection': { en: 'selection sort', ko: '선택 정렬' },
  },
};
