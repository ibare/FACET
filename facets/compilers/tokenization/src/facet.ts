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

import type { FacetJson } from '@ffacet/core/runtime';

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
  messages: {
    'caption.base': { en: 'Tokenization is the first stage of a compiler. It reads the source a character at a time from left to right and cuts it into the smallest units that carry meaning — taking the longest run it can, and leaving whitespace and comments as nothing but traces.', ko: '토큰화는 컴파일러의 첫 단계다. 사람이 쓴 소스 문자열을 좌에서 우로 한 글자씩 읽어 의미 있는 최소 단위로 끊는다. 더 길게 묶을 수 있으면 더 길게 묶고, 공백과 주석은 흔적으로만 남는다.' },
    'caption.comment': { en: 'A comment never becomes a token — it stays as a trace.', ko: '주석은 토큰이 되지 못해 흔적으로만 남는다.' },
    'caption.example': { en: 'Example {n} — {name}', ko: '예제 {n} — {name}' },
    'caption.ignoredInput': { en: 'Input ignored — {op}: {raw}', ko: '입력 무시 — {op}: {raw}' },
    'caption.scanDone': { en: 'Scan complete — {count} tokens.', ko: '스캔 완료 — {count}장의 토큰.' },
    'caption.unrecognized': { en: 'An unrecognized character — it lands as a red card.', ko: '인식 불가 글자 — 빨간 카드로 박힌다.' },
    'concept.line1': { en: 'Tokenization is the first stage of a compiler — reading left to right, one', ko: '토큰화는 컴파일러의 첫 단계 — 좌에서 우로 한 글자씩 읽어 의미 있는 최소' },
    'concept.line2': { en: 'character at a time, it cuts the source into the smallest meaningful units', ko: '단위 (토큰) 로 끊어 낸다. 더 길게 묶을 수 있으면 더 길게 묶고, 공백·주석' },
    'concept.line3': { en: '(tokens), taking the longest run it can. Whitespace and comments never', ko: '은 토큰이 되지 못하고 회색으로 가라앉는다. 위 띠에서 글자가 어떻게 묶여' },
    'concept.line4': { en: 'become tokens and sink into grey. Watch the strip above feed the cards below.', ko: '아래 카드로 떨어지는지 보자.' },
    'kind.error': { en: 'error', ko: '오류' },
    'kind.identifier': { en: 'identifier', ko: '식별자' },
    'kind.keyword': { en: 'keyword', ko: '키워드' },
    'kind.number': { en: 'number', ko: '숫자' },
    'kind.operator': { en: 'operator', ko: '연산자' },
    'kind.punctuation': { en: 'punctuation', ko: '구분자' },
    'kind.string': { en: 'string', ko: '문자열' },
    'kind.swallowed': { en: 'swallowed', ko: '삼킴' },
    'label.closed': { en: '↓ closed', ko: '↓ 닫힘' },
    'label.input': { en: 'input', ko: '입력' },
    'label.legend': { en: 'legend', ko: '범례' },
    'label.output': { en: 'output tokens', ko: '출력 토큰' },
    'label.references': { en: 'see also', ko: '참고' },
    'label.title': { en: 'Tokenization — one beat of condensation', ko: '토큰화 — 한 박자의 응결' },
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
