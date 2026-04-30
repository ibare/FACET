/**
 * Tokenization (어휘 분석) facet JSON 선언.
 *
 * 진행 모델: 입력 반응형 (ReactiveMechanism). mount 직후 자동 1회 스캔이
 * 자율 박자 (한 글자 ≈ 280ms) 로 흘러간 뒤 waitForInput. 사용자는 예제 전환,
 * 재생, 리셋, 속도 슬라이더로 다시 박자를 깨운다.
 *
 * 컨트롤바 어휘 (기획 §8):
 *   [ next-example ] [ replay ] [ speed-slider ] [ reset ]
 *
 * 식별자 (C1): `gaze` `segment` `card:<index>` 명시 prefix.
 *
 * 종류 색 팔레트 — 기획 §9 와 일치 (categorical 시드 위에 의미 라벨로 매핑).
 *   keyword (보라) / identifier (청록) / number (주황) / operator (노랑) /
 *   punct (회청) / string (연두) / error (빨강) / swallow (연회색).
 *   실제 hex 는 view 가 design-tokens 의 categorical/palette 에서 받아 채운다 —
 *   facet.ts 는 의미 라벨만 선언하고 색은 view 결정.
 */

import type { FacetJson } from '@facet/core/runtime';

export const tokenizationFacet: FacetJson = {
  id: 'facet:tokenization',
  title: { en: 'Tokenization (Lexical Analysis)', ko: '토큰화 (어휘 분석)' },
  description: {
    en: 'A left-to-right gaze that fuses same-kind characters into a single segment until it cannot extend further, then drops the closed run as a labeled token card onto the output row',
    ko: '응시가 좌에서 우로 한 글자씩 전진하며 같은 종류 글자들을 한 구간으로 묶다가 더는 못 묶이는 순간 닫고, 그 구간을 종류 라벨과 원문이 함께 새겨진 한 장의 카드로 떨궈 출력열에 붙이는 첫 변환 단계',
  },
  algorithm: 'module:tokenization',
  projector: 'module:tokenizationProjector',
  initialData: {
    type: 'tokenization',
    initialExampleIndex: 1,
    examples: [
      {
        id: 'basic',
        name: { en: 'var x = 42;', ko: '간단 — var x = 42;' },
        source: 'var x = 42;',
      },
      {
        id: 'compound',
        name: {
          en: 'if x >= 10 // ok',
          ko: '복합 — if x >= 10  // ok',
        },
        source: 'if x >= 10  // ok\n  return x;',
      },
      {
        id: 'comment',
        name: { en: '// note + return n', ko: '주석 — // note + return n' },
        source: '// note\n  return n',
      },
    ],
    stepMs: 280,
    closePulseRatio: 0.9,
    endHoldMs: 1100,
    keywords: [
      'if',
      'else',
      'return',
      'var',
      'let',
      'const',
      'while',
      'for',
      'function',
      'true',
      'false',
      'null',
    ],
    kindPalette: {
      keyword: { swatch: 'keyword', label: { en: 'keyword', ko: '키워드' } },
      identifier: { swatch: 'identifier', label: { en: 'identifier', ko: '식별자' } },
      number: { swatch: 'number', label: { en: 'number', ko: '숫자' } },
      operator: { swatch: 'operator', label: { en: 'operator', ko: '연산자' } },
      punct: { swatch: 'punct', label: { en: 'punct', ko: '구분자' } },
      string: { swatch: 'string', label: { en: 'string', ko: '문자열' } },
      error: { swatch: 'error', label: { en: 'error', ko: '오류' } },
      swallow: { swatch: 'swallow', label: { en: 'whitespace', ko: '삼킴' } },
    },
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'tokenization-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'button',
          action: 'next-example',
          label: { en: 'Next example', ko: '다음 예제' },
        },
        { widget: 'button', action: 'replay', label: { en: 'Replay', ko: '다시 재생' } },
        { widget: 'speed-slider', action: 'speed' },
        { widget: 'button', action: 'reset', label: { en: 'Reset', ko: '초기화' } },
      ],
    },
  },
};
