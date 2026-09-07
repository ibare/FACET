/**
 * HashFixedLength facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "한 글자를 넣든 파일을 넣든 왜 결과 길이가 같은가?"
 *
 * 왼쪽 입력은 0바이트부터 화면 밖으로 잘려 나갈 만큼 길고, 오른쪽 출력 상자는
 * 넷이 정확히 같은 폭이다. 마지막 걸음의 좌우 안내선이 그 사실을 짚는다.
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범:
 *   - 필수 조작 없음. 다시 보기 하나만 둔다.
 *   - 제목 없음 — 제목은 글의 문단이 준다.
 *   - 짧음 — 세 걸음 재생하고 정지한다.
 *   - 한 주장 — 진행 캡션들은 한 논증의 단계다.
 *   - 메트릭 없음.
 *   - 캔버스 폭 620 — playground 가 아니라 글의 문단 폭에 맞춘다.
 *
 * 해시는 전부 실측 SHA-256 이다. 각주가 밝히듯 3.7MB 파일도 같은 64자가 되며,
 * 빈 입력에도 해시가 있다 (e3b0c442…).
 *
 * title / description / messages 는 en·ko 만 채웠다 (조각 방식 1차 시험).
 */

import type { FacetJson } from '@ffacet/core/runtime';

export const hashFixedLengthFacet: FacetJson = {
  id: 'facet:hashFixedLength',
  title: { en: 'Always the Same Length', ko: '무엇을 넣든 같은 길이' },
  description: {
    en: 'Inputs from nothing to a whole file, outputs all exactly the same size',
    ko: '입력은 빈 것부터 파일까지, 출력은 언제나 같은 크기',
  },
  algorithm: 'module:hashFixedLength',
  projector: 'module:hashFixedLengthProjector',
  initialData: {
    type: 'hash-fixed-length',
    algorithmLabel: 'SHA-256',
    hashBits: 256,
    // 전부 실측 SHA-256. 길이 차이가 한눈에 들어오도록 0B 부터 화면을 넘길
    // 만큼 긴 것까지 벌려 골랐다.
    rows: [
      {
        input: '',
        bytes: 0,
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
      {
        input: 'a',
        bytes: 1,
        hash: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      },
      {
        input: 'hello world',
        bytes: 11,
        hash: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      },
      {
        input:
          'The quick brown fox jumps over the lazy dog and keeps running far past the edge of this line',
        bytes: 92,
        hash: '5cae16c80af2cdd75771050bb43313674050b21782a8cc8abd1b78275152be51',
      },
    ],
    // 네 줄이 접혀 건너가는 reveal-outputs 가 가장 긴 걸음이라 그것에 맞춘다.
    stepMs: 1200,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }, { ref: 'controls' }],
  },
  messages: {
    'caption.base': {
      en: 'However long the input is, the output is always the same length.',
      ko: '입력이 아무리 길어도 출력의 길이는 언제나 같다.',
    },
    'caption.inputsVary': {
      en: 'The inputs run from nothing to {bytes} bytes.',
      ko: '입력은 빈 것부터 {bytes} 바이트까지 제각각이다.',
    },
    'caption.outputsUniform': {
      en: 'Every output starts and ends at the same place — {bits} bits, whatever went in.',
      ko: '출력은 모두 같은 자리에서 시작해 같은 자리에서 끝난다 — 무엇이 들어갔든 {bits} 비트다.',
    },
    'label.inputColumn': {
      en: 'input',
      ko: '입력',
    },
    'label.outputColumn': {
      en: '{algorithm} output',
      ko: '{algorithm} 출력',
    },
    'label.empty': {
      en: '(nothing)',
      ko: '(빈 입력)',
    },
    'label.always': {
      en: 'always {bits} bits',
      ko: '언제나 {bits} 비트',
    },
    'label.note': {
      en: 'Even an empty input has a digest, and a 3.7 MB file gives the same 64 characters.',
      ko: '빈 입력에도 해시가 있고, 3.7MB 파일을 넣어도 같은 64자가 나온다.',
    },
  },
  blocks: {
    stage: { type: 'fixed-length-stage' },
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
        // ReactiveMechanism 은 reset/speed 외의 action 을 dispatch 로 보내므로
        // (supportedControls 의 '*') facet 고유 버튼이 그대로 통한다.
        { widget: 'button', action: 'advance', label: { en: 'Step', ko: '한 걸음' } },
      ],
    },
  },
};
