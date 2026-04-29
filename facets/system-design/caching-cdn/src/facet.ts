/**
 * CachingCdn facet JSON 선언.
 *
 * 진행 모델: 입력 반응형 (ReactiveMechanism). mount 즉시 자동 시연 (서울 미스 →
 * 도쿄 미스 → 프랑크푸르트 미스 → 세 도시 동시 히트) 후 학습자 입력 대기.
 *
 * 컨트롤바 어휘 (기획 §6 §8 컨트롤 영역):
 *   [ content ] [ edge ] [ request ] [ auto-demo ] [ reset ]
 *
 * 코드 패널은 1차 구현에서 생략 (시스템 행동 시각이라 IR/언어 매핑 불필요).
 *
 * 식별자 (C1): `edge:<city>` `client:<city>` `regional:<id>` `origin:<id>`
 *              `content:<id>` `req:<traceIndex>` 명시 prefix.
 */

import type { FacetJson } from '@facet/core/runtime';

export const cachingCdnFacet: FacetJson = {
  id: 'facet:cachingCdn',
  title: { en: 'CDN', ko: 'CDN' },
  description: {
    en: 'Globally distributed edge caches receive nearby clients — near-cached answers come back fast, missing answers travel up the hierarchy and refill the edges',
    ko: '전 세계 도시마다 흩어진 엣지 캐시들이 가까운 클라이언트의 요청을 받아 — 가진 답이면 짧게, 없으면 위 계층까지 다녀와 엣지를 채워 두는 시스템 행위',
  },
  algorithm: 'module:cachingCdn',
  projector: 'module:cachingCdnProjector',
  initialData: {
    type: 'caching-cdn',
    edges: [
      { id: 'seoul', label: '서울', nx: 0.78, ny: 0.42 },
      { id: 'tokyo', label: '도쿄', nx: 0.84, ny: 0.44 },
      { id: 'mumbai', label: '뭄바이', nx: 0.65, ny: 0.55 },
      { id: 'frankfurt', label: '프랑크푸르트', nx: 0.50, ny: 0.34 },
      { id: 'newyork', label: '뉴욕', nx: 0.26, ny: 0.40 },
      { id: 'saopaulo', label: '상파울루', nx: 0.32, ny: 0.72 },
    ],
    regional: { id: 'r1' },
    origin: { id: 'o1' },
    contents: [
      { id: 'A', label: 'A' },
      { id: 'B', label: 'B' },
      { id: 'C', label: 'C' },
    ],
    autoDemoIntervalMs: 900,
    autoDemoSequence: [
      { op: 'request', edge: 'seoul', content: 'A' },
      { op: 'request', edge: 'tokyo', content: 'A' },
      { op: 'request', edge: 'frankfurt', content: 'A' },
      { op: 'request', edge: 'seoul', content: 'A' },
      { op: 'request', edge: 'tokyo', content: 'A' },
      { op: 'request', edge: 'frankfurt', content: 'A' },
    ],
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
    stage: {
      type: 'cdn-stage',
    },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'value-input',
          name: 'content',
          action: 'input',
          label: { en: 'content', ko: '콘텐츠' },
          placeholder: '예: A',
          default: '',
        },
        {
          widget: 'value-input',
          name: 'edge',
          action: 'input',
          label: { en: 'edge', ko: '엣지' },
          placeholder: '예: seoul',
          default: '',
        },
        { widget: 'button', action: 'request', label: { en: 'Request', ko: '요청' } },
        { widget: 'button', action: 'auto-demo', label: { en: 'Auto demo', ko: '자동 시연' } },
        { widget: 'button', action: 'reset', label: { en: 'Reset', ko: '초기화' } },
      ],
      metrics: [
        { name: 'request-count', label: { en: 'Req', ko: '요청' }, initial: 0 },
        { name: 'hit-count', label: { en: 'Hit', ko: '히트' }, initial: 0 },
        { name: 'miss-count', label: { en: 'Miss', ko: '미스' }, initial: 0 },
        { name: 'origin-hit', label: { en: 'Origin', ko: '오리진' }, initial: 0 },
      ],
    },
  },
};
