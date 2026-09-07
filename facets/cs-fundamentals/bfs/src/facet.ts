/**
 * BFS facet JSON 선언.
 *
 * 시각적 정체성 5종을 한눈에 드러내는 레이아웃:
 *   - stage(graph-layout, concentric-rings feature) — 동심 파면 + 등고선 + 거리 배지.
 *   - distanceCounter(text-display)                  — 현재 k → k+1 미니 표시.
 *   - queue(conveyor-queue, features 빈 배열)         — 캡(IN/OUT) + 스탬프 큐브.
 *   - codePanel(code-view)                           — phase 동기 코드 하이라이트.
 *
 * 기획 9 의 "너비가 넓은 그래프" preset 을 단일 initialData 로 수록.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';
import { BFS_CANVAS } from './projector.js';

export const bfsFacet: FacetJson = {
  id: 'facet:bfs',
  title: { en: 'BFS', ko: 'BFS (너비 우선 탐색)', ja: '幅優先探索 (BFS)', zh: '广度优先搜索 (BFS)', ar: 'البحث بالعرض (BFS)', es: 'BFS (búsqueda en anchura)', fr: 'BFS (parcours en largeur)', hi: 'BFS (चौड़ाई-प्रथम खोज)', id: 'BFS (telusur melebar)', pt: 'BFS (busca em largura)' },
  description: { en: 'Concentric wavefront: same-distance vertices ignite in one flash', ko: '같은 거리 정점들이 한 프레임 섬광으로 동시에 발견되는 동심 파면', ja: '同心の波面 — 同じ距離の頂点が一度の閃光で同時に見つかる', zh: '同心的波前 — 同距离的顶点在一次闪光中同时被发现', ar: 'جبهة موجية متحدة المركز — تشتعل الرؤوس المتساوية البعد في ومضة واحدة', es: 'Frente de onda concéntrico: los vértices a igual distancia se encienden en un solo destello', fr: 'Front d\'onde concentrique — les sommets à même distance s\'allument en un seul éclair', hi: 'संकेंद्री तरंगाग्र — समान दूरी के शीर्ष एक ही चमक में जगमगाते हैं', id: 'Muka gelombang sepusat — simpul berjarak sama menyala dalam satu kilat', pt: 'Frente de onda concêntrica — vértices à mesma distância acendem num só clarão' },
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
      label: { en: 'Layer', ko: '레이어', ja: '層', zh: '层', ar: 'طبقة', es: 'Capa', fr: 'Couche', hi: 'परत', id: 'Lapis', pt: 'Camada' },
    },
    queue: {
      // BFS 의 FIFO frontier 를 conveyor-queue view 로 시각화. 풀 기능 (나이
      // 그라디언트 / 꼬리 로그 / bounded) 은 이 맥락에서 과잉이라 features 를
      // 비워 캡(IN/OUT) + 스탬프(#n) + 시안 큐브만 남긴다.
      type: 'conveyor-queue',
      label: { en: 'FIFO Queue', ko: 'FIFO 큐 (좌: 퇴장, 우: 입장)', ja: 'FIFO キュー', zh: 'FIFO 队列', ar: 'طابور FIFO', es: 'Cola FIFO', fr: 'File FIFO', hi: 'FIFO कतार', id: 'Antrean FIFO', pt: 'Fila FIFO' },
      features: [],
    },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.playback,
      metrics: [
        { name: 'visited-count', label: { en: 'Visited', ko: '방문', ja: '訪問済み', zh: '已访问', ar: 'مُزار', es: 'Visitados', fr: 'Visités', hi: 'देखे गए', id: 'Dikunjungi', pt: 'Visitados' }, initial: 0 },
        { name: 'layer-count', label: { en: 'Layers', ko: '레이어', ja: '層数', zh: '层数', ar: 'طبقات', es: 'Capas', fr: 'Couches', hi: 'परतें', id: 'Lapisan', pt: 'Camadas' }, initial: 0 },
        { name: 'edge-scan-count', label: { en: 'Scans', ko: '스캔', ja: '走査', zh: '扫描', ar: 'مسحات', es: 'Barridos', fr: 'Balayages', hi: 'स्कैन', id: 'Pindai', pt: 'Varreduras' }, initial: 0 },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드', ja: 'コード', zh: '代码', ar: 'الشيفرة', es: 'Código', fr: 'Code', hi: 'कोड', id: 'Kode', pt: 'Código' },
      ir: 'ir:bfs-iterative',
    },
  },
};
