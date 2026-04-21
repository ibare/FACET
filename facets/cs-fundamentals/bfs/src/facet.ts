/**
 * BFS facet JSON 선언.
 *
 * 시각적 정체성 5종을 한눈에 드러내는 레이아웃:
 *   - stage(graph-layout, concentric-rings feature) — 동심 파면 + 등고선 + 거리 배지.
 *   - distanceCounter(text-display)                  — 현재 k → k+1 미니 표시.
 *   - queue(queue-display)                           — FIFO 블록 리듬.
 *   - codePanel(code-view)                           — phase 동기 코드 하이라이트.
 *
 * 기획 9 의 "너비가 넓은 그래프" preset 을 단일 initialData 로 수록.
 */

import type { FacetJson } from '@facet/core/runtime';
import { BFS_CANVAS } from './projector.js';

export const bfsFacet: FacetJson = {
  id: 'facet:bfs',
  title: { en: 'BFS', ko: 'BFS (너비 우선 탐색)' },
  description: {
    en: 'Concentric wavefront: same-distance vertices ignite in one flash',
    ko: '같은 거리 정점들이 한 프레임 섬광으로 동시에 발견되는 동심 파면',
  },
  algorithm: 'module:bfs',
  projector: 'module:bfsProjector',
  initialData: {
    type: 'graph',
    nodes: [
      { id: 'A' },
      { id: 'B' },
      { id: 'C' },
      { id: 'D' },
      { id: 'E' },
      { id: 'F' },
      { id: 'G' },
      { id: 'H' },
      { id: 'I' },
      { id: 'J' },
      { id: 'K' },
      { id: 'L' },
    ],
    adjacency: {
      A: ['B', 'C', 'D'],
      B: ['A', 'E', 'F'],
      C: ['A', 'F', 'G'],
      D: ['A', 'G', 'H'],
      E: ['B', 'I'],
      F: ['B', 'C', 'I', 'J'],
      G: ['C', 'D', 'J', 'K'],
      H: ['D', 'K'],
      I: ['E', 'F', 'L'],
      J: ['F', 'G', 'L'],
      K: ['G', 'H', 'L'],
      L: ['I', 'J', 'K'],
    },
    source: 'A',
  },
  // 그래프 입력은 결정적이어야 한다 — shuffle 금지.
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      {
        type: 'row',
        gap: 8,
        align: 'stretch',
        children: [
          { ref: 'stage', grow: 1 },
          {
            type: 'column',
            gap: 8,
            children: [{ ref: 'distanceCounter' }],
          },
        ],
      },
      { ref: 'queue' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: {
      type: 'graph-layout',
      width: BFS_CANVAS.width,
      height: BFS_CANVAS.height,
      features: ['concentric-rings'],
    },
    distanceCounter: {
      type: 'text-display',
      label: { en: 'Layer', ko: '레이어' },
    },
    queue: {
      type: 'queue-display',
      label: { en: 'FIFO Queue', ko: 'FIFO 큐 (좌: 퇴장, 우: 입장)' },
    },
    controls: {
      type: 'control-bar',
      controls: ['play', 'step', 'pause', 'reset', { type: 'speed-slider', default: 1 }],
      metrics: [
        { name: 'visited-count', label: { en: 'Visited', ko: '방문' }, initial: 0 },
        { name: 'layer-count', label: { en: 'Layers', ko: '레이어' }, initial: 0 },
        { name: 'edge-scan-count', label: { en: 'Scans', ko: '스캔' }, initial: 0 },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드' },
      ir: 'ir:bfs-iterative',
    },
  },
};
