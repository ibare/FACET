/**
 * HashAvalanche facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "입력을 한 글자만 바꿨는데 왜 해시가 전혀 달라지는가?"
 *
 * 조각의 규범 (완결형 facet 과 다른 종류다):
 *   - 필수 조작 없음 — 아무것도 누르지 않아도 할 말을 마친다. 다만 다시 보기
 *     하나는 둔다. 이 조각은 격자가 물드는 운동 자체가 메시지라, 최종 상태만
 *     남으면 5칸이 131칸으로 증폭되는 대목을 놓친 사람이 되돌릴 길이 없다.
 *     "눌러야 완성되는 것" 과 "놓쳤을 때 되돌리는 것" 은 다르다.
 *   - 제목 없음 — header 를 두지 않는다. 제목은 글의 문단이 준다.
 *   - 짧음 — 네 걸음 재생하고 정지한다.
 *   - 한 주장 — 캡션 둘은 주장과 그 증거이지 서로 다른 주장이 아니다.
 *   - 메트릭 없음 — 셀 것이 없다. control-bar 는 버튼 하나만 싣는다.
 *
 * ReactiveMechanism 이라 mount 즉시 스스로 재생한다. 걸음 간격은 `stepMs` 가
 * 정한다 — 컨트롤바가 없어 speed-slider 로 늦출 수 없기 때문이다.
 *
 * 해시값은 실측 SHA-256 이다. 입력 'hello' 와 'hellp' 는 40비트 중 5비트만
 * (마지막 글자 0x6F ^ 0x70) 다른데 출력은 256비트 중 131비트가 다르다.
 * 12.5% 가 51.2% 로 증폭되는 이 대비가 조각의 전부다.
 *
 * 화면에는 언제나 견줄 두 항이 함께 있다 — 차이만 그리면 무엇과 무엇의 차이인지가
 * 사라지기 때문이다. 네 걸음: 입력 둘 → 입력 차이 → 출력 둘 → 출력 차이.
 *
 * title / description / messages 는 en·ko 만 채웠다. 조각 방식의 구조를
 * 확인하기 위한 1차 시험이라 10개 언어 확장은 채택 이후로 미룬다.
 */

import type { FacetJson } from '@ffacet/core/runtime';

export const hashAvalancheFacet: FacetJson = {
  id: 'facet:hashAvalanche',
  title: { en: 'Hash Avalanche', ko: '해시 눈사태' },
  description: {
    en: 'One changed character flips about half of a hash output',
    ko: '한 글자를 바꾸면 해시 출력의 절반이 뒤집힌다',
  },
  algorithm: 'module:hashAvalanche',
  projector: 'module:hashAvalancheProjector',
  initialData: {
    type: 'hash-avalanche',
    algorithmLabel: 'SHA-256',
    inputA: 'hello',
    inputB: 'hellp',
    hashA: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    hashB: 'fdd7585e08c4e2afd71dcabdb4636c89d557a3f42db9e2040c8bbd1708aa4ce7',
    stepMs: 900,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }, { ref: 'controls' }],
  },
  messages: {
    'caption.base': {
      en: 'A hash turns a tiny change of the input into a completely different output.',
      ko: '해시는 입력이 조금만 달라져도 출력이 통째로 달라진다.',
    },
    'caption.result': {
      en: 'Only {inputFlipped} of {inputTotal} input bits differ, but {outputFlipped} of {outputTotal} output bits do.',
      ko: '입력은 {inputTotal} 비트 중 {inputFlipped} 비트만 달랐는데, 출력은 {outputTotal} 비트 중 {outputFlipped} 비트가 다르다.',
    },
    'label.bitDiff': {
      en: '{flipped} / {total} bits differ',
      ko: '{flipped} / {total} 비트 다름',
    },
    'label.through': {
      en: '↓  {algorithm}  ↓',
      ko: '↓  {algorithm}  ↓',
    },
  },
  blocks: {
    stage: { type: 'avalanche-stage' },
    controls: {
      type: 'control-bar',
      // ReactiveMechanism 의 reset() 은 끝에 ensureStarted() 를 부른다 — 즉
      // reset 이 곧 다시 재생이다. 그래서 action 은 reset 이고 라벨만 다르다.
      controls: [
        {
          widget: 'button',
          action: 'reset',
          label: { en: 'Replay', ko: '다시 보기' },
        },
      ],
    },
  },
};
