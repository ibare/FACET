/**
 * @piece 경계 밖 접근 — 번호가 끝을 넘으면.
 *
 * 답하는 질문 하나: **배열의 길이를 넘는 번호를 쓰면 무엇이 읽히는가.**
 * 주소 셈은 길이를 모르므로 멈추지 않는다. 배열의 끝을 지난 자리를 가리키고,
 * 거기 있던 남의 값을 그대로 읽는다. 경계 검사는 그 셈이 자리에 닿기 전에
 * 세우는 벽이다.
 *
 * 조각이므로 header 도 metrics 도 두지 않는다 (S-piece). 제목은 글의 문단이 주고,
 * 셀 것은 없다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const outOfBoundsFacet: FacetJson = {
  id: 'facet:outOfBounds',
  title: { en: 'Out-of-bounds access', ko: '경계 밖 접근' },
  description: {
    en: 'What an index past the end of an array actually points at.',
    ko: '배열의 끝을 넘는 번호가 실제로 무엇을 가리키는가.',
  },
  algorithm: 'module:outOfBounds',
  projector: 'module:outOfBoundsProjector',

  initialData: {
    type: 'out-of-bounds',
    arrayName: 'arr',
    // int32 다섯 개. 0x1000 부터 20바이트 (0x1000 ~ 0x1013) 를 차지한다.
    values: [11, 22, 33, 44, 55],
    baseAddress: 0x1000,
    stride: 4,
    // 배열 바로 뒤 0x1014 에 놓인 다른 변수.
    neighborName: 'count',
    neighborValue: 1000,
    safeIndex: 4,
    outIndex: 5,
    stepMs: 780,
  },

  layout: {
    type: 'column',
    gap: 8,
    align: 'center',
    children: [{ ref: 'stage' }, { ref: 'controls' }],
  },

  blocks: {
    stage: { type: 'out-of-bounds-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },

  messages: {
    'caption.compute': {
      en: 'The index becomes an address: {base} + {i} × {stride} = {addr}.',
      ko: '번호가 주소가 된다: {base} + {i} × {stride} = {addr}.',
    },
    'caption.inside': {
      en: '{name}[{i}] lands on the last cell the array owns.',
      ko: '{name}[{i}] — 배열이 가진 마지막 칸에 내려선다.',
    },
    'caption.readInside': {
      en: 'It reads {value}, the value the array keeps there.',
      ko: '읽히는 값은 {value}. 배열이 거기 담아 둔 것이다.',
    },
    'caption.keepsCounting': {
      en: 'Now {i}. The arithmetic checks nothing — it just keeps counting: {addr}.',
      ko: '이번엔 {i}. 셈은 아무것도 확인하지 않고 그대로 이어진다 — {addr}.',
    },
    'caption.crossed': {
      en: '{addr} lies past the end of the array, on the next variable.',
      ko: '{addr} — 배열의 끝을 지난 자리다. 커서는 다음 변수 위에 서 있다.',
    },
    'caption.readsNeighbor': {
      en: '{name}[{i}] reads {value} all the same. That value belongs to someone else.',
      ko: '{name}[{i}] — 그래도 값을 읽어 온다: {value}. 그 값은 남의 것이다.',
    },
    'caption.guard': {
      en: 'A bounds check stands at the end and asks {lo} ≤ i < {hi} before any access.',
      ko: '경계 검사가 끝에 서서, 접근하기 전에 {lo} ≤ i < {hi} 인지 묻는다.',
    },
    'caption.blocked': {
      en: '{name}[{i}] never reaches the address. It stops at the edge instead.',
      ko: '{name}[{i}] — 그 주소에 닿지 못한다. 경계 앞에서 멈춘다.',
    },

    'label.arrayRange': {
      en: '{from} – {to} · {bytes} bytes',
      ko: '{from} – {to} · {bytes}바이트',
    },
    // 전제를 밝히는 각주 (S-piece). 이 배치는 그림의 가정이고, 그 사실이 곧
    // 경계 밖 접근의 결과가 정해져 있지 않다는 말이기도 하다.
  },
};
