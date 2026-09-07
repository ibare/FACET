/**
 * HashIntegrityCheck facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "받은 파일이 원본 그대로인지 어떻게 아는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 화면의 골격은 대조표가 아니라 갈라진 두 경로다. 이 조각이 답하는 것은 대조를
 * 어떻게 하느냐가 아니라 **무엇에 기대어 그 대조를 믿느냐** 이고, 그 답이
 * "경로가 둘이다" 이기 때문이다. 경로가 하나면 파일을 고친 쪽이 해시도 고친다.
 *
 * 그래서 손대는 일도 도중에 일어난다 — 도착한 뒤 값이 바뀌면 "오는 길에 당했다"
 * 가 아니라 "받고 나서 달라졌다" 로 읽힌다. 아래 해시 경로는 그동안 아무 일도
 * 일어나지 않으며, 그 정지가 논증이다.
 *
 * 데이터는 실측 SHA-256 이다. 'Pay 100 to Alice' 와 'Pay 900 to Alice' 는
 * 숫자 한 글자만 다른데 해시는 알아볼 수 없을 만큼 갈린다.
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
    // 토큰이 경로를 건너는 travel 이 한 걸음 안에서 끝나야 한다.
    stepMs: 1500,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }, { ref: 'controls' }],
  },
  messages: {
    'caption.base': {
      en: 'The file and its hash travel by different routes.',
      ko: '파일과 그 해시는 서로 다른 경로로 온다.',
    },
    'caption.split': {
      en: 'Two routes leave the origin — the file, and its hash.',
      ko: '원본에서 두 경로가 갈라진다 — 파일과 그 해시.',
    },
    'caption.match': {
      en: 'Both arrive and the two agree.',
      ko: '둘 다 도착했고 서로 맞는다.',
    },
    'caption.tampered': {
      en: 'Someone edits the file on the way — one digit.',
      ko: '오는 길에 누군가 파일을 고친다 — 숫자 하나.',
    },
    'caption.detected': {
      en: 'They never touched the lower route, so the hash still tells on them.',
      ko: '아래 경로는 건드리지 못했으니, 해시가 그것을 일러바친다.',
    },
    'label.origin': { en: 'origin', ko: '원본' },
    'label.target': { en: 'you', ko: '받는 쪽' },
    'label.filePath': { en: 'any route', ko: '아무 경로' },
    'label.hashPath': { en: 'a route you trust', ko: '믿는 경로' },
    'label.file': { en: 'file', ko: '파일' },
    'label.hash': { en: 'hash', ko: '해시' },
    'label.match': { en: '✓', ko: '✓' },
    'label.mismatch': { en: '✗', ko: '✗' },
    'label.scissors': { en: '✂', ko: '✂' },
    'label.note': {
      en: 'If both came down the same route, whoever changed the file could have changed the hash too.',
      ko: '둘이 같은 경로로 왔다면, 파일을 고친 쪽이 해시도 함께 고쳤을 것이다.',
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
