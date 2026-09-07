/**
 * HashIntegrityCheck facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "받은 파일이 원본 그대로인지 어떻게 아는가?"
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 데이터는 실측 SHA-256 이다. 'Pay 100 to Alice' 와 'Pay 900 to Alice' 는
 * 숫자 한 글자만 다른데 해시는 알아볼 수 없을 만큼 갈린다.
 *
 * 각주가 밝히는 전제: 이 방법이 서는 것은 해시를 믿을 수 있는 경로로 받았을
 * 때뿐이다. 파일과 해시를 같은 곳에서 받으면 둘 다 바꿔치기할 수 있다.
 *
 * title / description / messages 는 en·ko 만 채웠다 (조각 방식 1차 시험).
 */

import type { FacetJson } from '@ffacet/core/runtime';

export const hashIntegrityCheckFacet: FacetJson = {
  id: 'facet:hashIntegrityCheck',
  title: { en: 'Checking What You Received', ko: '받은 것이 원본인지 확인하기' },
  description: {
    en: 'One published hash tells you whether the copy you got was touched',
    ko: '내걸린 해시 한 줄이 받은 사본이 손댔는지를 알려 준다',
  },
  algorithm: 'module:hashIntegrityCheck',
  projector: 'module:hashIntegrityCheckProjector',
  initialData: {
    type: 'hash-integrity',
    algorithmLabel: 'SHA-256',
    referenceHash: '5b2dbcdd960156e27215c41cef91e1c7d967ea828b7cc2fdefa546987cbde91f',
    intact: {
      content: 'Pay 100 to Alice',
      hash: '5b2dbcdd960156e27215c41cef91e1c7d967ea828b7cc2fdefa546987cbde91f',
    },
    tampered: {
      content: 'Pay 900 to Alice',
      hash: '988bcb940b89811fb258dcc53b6ea8d8f848baa8c29049ed73975e0e57d1c99c',
    },
    stepMs: 950,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }, { ref: 'controls' }],
  },
  messages: {
    'caption.base': {
      en: 'The original publishes its hash, so anyone can check what they received against it.',
      ko: '원본이 자기 해시를 내걸면, 받은 사람은 그것과 견줘 확인할 수 있다.',
    },
    'caption.match': {
      en: 'Identical to the published hash.',
      ko: '내걸린 해시와 한 글자도 다르지 않다.',
    },
    'caption.mismatch': {
      en: 'Nothing like it — this one was changed on the way.',
      ko: '닮은 구석이 없다 — 오는 길에 바뀐 것이다.',
    },
    'caption.oneChar': {
      en: 'One character was enough to break the match.',
      ko: '한 글자면 대조가 깨지기에 충분하다.',
    },
    'label.published': { en: 'published hash', ko: '내걸린 해시' },
    'label.intact': { en: 'received (untouched)', ko: '받은 것 (손대지 않음)' },
    'label.tampered': { en: 'received (altered)', ko: '받은 것 (손댐)' },
    'label.match': { en: '✓', ko: '✓' },
    'label.mismatch': { en: '✗', ko: '✗' },
    'label.note': {
      en: 'The file can come from anywhere as long as the hash came from somewhere trusted.',
      ko: '해시를 믿을 수 있는 곳에서 받았다면, 파일은 어디서 받아도 된다.',
    },
  },
  blocks: {
    stage: { type: 'integrity-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        { widget: 'button', action: 'reset', label: { en: 'Replay', ko: '다시 보기' } },
      ],
    },
  },
};
