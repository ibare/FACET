/**
 * Queue (FIFO) facet JSON 선언.
 *
 * 시각적 정체성 5종을 파이프 하나에 집약 (v2 재설계 §7):
 *   - stage(conveyor-queue)  — 납작한 3D 외관 파이프 · 양끝 비대칭 캡 ·
 *                              나이 그라디언트 · 입장 스탬프 · 동기 시프트 · 꼬리 로그.
 *   - codePanel(code-view)   — phase 동기 코드 하이라이트.
 *
 * initialData 는 기획 섹션 9 의 "소량 프리셋 + overflow 여유" 시나리오를 수록.
 * capacity=10 이라 overflow 는 일어나지 않지만, bounded 모드의 "용량/크기"
 * 표시를 드러내기 위해 bounded feature 를 켠다. (overflow 시연 preset 은
 * 향후 별도 preset 드롭다운으로 분리.)
 */

import type { FacetJson } from '@facet/core/runtime';

export const queueFacet: FacetJson = {
  id: 'facet:queue',
  title: { en: 'Queue (FIFO)', ko: '큐 (FIFO)' },
  description: {
    en: 'Conveyor belt: oldest leaves first, newest rides at the back',
    ko: '컨베이어 벨트 — 가장 오래 기다린 것이 가장 먼저 떠나는 기계',
  },
  algorithm: 'module:queue',
  projector: 'module:queueProjector',
  initialData: {
    type: 'queue',
    initialValues: ['A', 'B', 'C'],
    capacity: 10,
    scenario: [
      { op: 'enqueue', value: 'D' },
      { op: 'enqueue', value: 'E' },
      { op: 'dequeue' },
      { op: 'enqueue', value: 'F' },
      { op: 'peek' },
      { op: 'dequeue' },
      { op: 'dequeue' },
      { op: 'enqueue', value: 'G' },
      { op: 'dequeue' },
      { op: 'dequeue' },
      { op: 'dequeue' },
      { op: 'dequeue' },
    ],
  },
  // 시나리오 순서 = 학습 설명의 순서. 섞지 않는다.
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      // Queue 는 파이프가 주인공 — view 가 주는 기능 최소 pad 위에 facet 고유의
      // 상하 breathing 을 얹어 "패널 중앙에서 파이프가 숨 쉰다" 는 시각 정체성을 유지.
      { ref: 'stage', padding: '12px 0' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: {
      type: 'conveyor-queue',
      label: { en: 'Queue', ko: '큐' },
      capacity: 10,
      maxTailEntries: 3,
      features: ['bounded', 'aging-gradient', 'tail-log', 'scoreboard'],
    },
    controls: {
      type: 'control-bar',
      controls: ['play', 'step', 'pause', 'reset', { type: 'speed-slider', default: 1 }],
      metrics: [
        { name: 'enqueue-count', label: { en: 'Enqueued', ko: '입장' }, initial: 0 },
        { name: 'dequeue-count', label: { en: 'Dequeued', ko: '퇴장' }, initial: 0 },
        { name: 'peek-count', label: { en: 'Peek', ko: '조회' }, initial: 0 },
        { name: 'overflow-count', label: { en: 'Overflow', ko: '넘침' }, initial: 0 },
        { name: 'underflow-count', label: { en: 'Underflow', ko: '빔' }, initial: 0 },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드' },
      ir: 'ir:queue-imperative',
    },
  },
};
