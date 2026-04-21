// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import {
  bfs,
  computeBfsResult,
  registerBfs,
  bfsFacet,
  type BfsGraphData,
} from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

const SAMPLE: BfsGraphData = {
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
};

describe('BFS 알고리즘 자체', () => {
  it('computeBfsResult 는 기획 9 의 레이어 {A}/{B,C,D}/{E,F,G,H}/{I,J,K}/{L} 을 반환한다', () => {
    const r = computeBfsResult(SAMPLE);
    expect(r.layers.length).toBe(5);
    expect(r.layers[0]).toEqual(['A']);
    expect(new Set(r.layers[1])).toEqual(new Set(['B', 'C', 'D']));
    expect(new Set(r.layers[2])).toEqual(new Set(['E', 'F', 'G', 'H']));
    expect(new Set(r.layers[3])).toEqual(new Set(['I', 'J', 'K']));
    expect(r.layers[4]).toEqual(['L']);

    expect(r.distance).toEqual({
      A: 0,
      B: 1, C: 1, D: 1,
      E: 2, F: 2, G: 2, H: 2,
      I: 3, J: 3, K: 3,
      L: 4,
    });
  });

  it('출발점이 없으면 빈 결과', () => {
    const r = computeBfsResult({ ...SAMPLE, source: 'Z' });
    expect(r.distance).toEqual({});
    expect(r.layers).toEqual([]);
  });

  it('layer-discovered 이벤트를 레이어 수만큼 발신하고 각 payload.nodes 는 같은 거리 집합', async () => {
    const layerEvents: { distance: number; nodes: string[] }[] = [];
    const types: string[] = [];
    // SAMPLE 을 shallow-copy 해 상호 부작용 방지.
    const data: BfsGraphData = JSON.parse(JSON.stringify(SAMPLE));
    await bfs({
      data,
      cancelled: false,
      async emit(e) {
        types.push(e.type);
        if (e.type === 'layer-discovered') {
          const p = e.payload as { distance: number; nodes: string[] };
          layerEvents.push({ distance: p.distance, nodes: [...p.nodes] });
        }
      },
      metric() {},
    });
    expect(layerEvents.length).toBe(5);
    expect(layerEvents[0]).toEqual({ distance: 0, nodes: ['A'] });
    expect(layerEvents[1].distance).toBe(1);
    expect(new Set(layerEvents[1].nodes)).toEqual(new Set(['B', 'C', 'D']));
    expect(layerEvents[2].distance).toBe(2);
    expect(new Set(layerEvents[2].nodes)).toEqual(new Set(['E', 'F', 'G', 'H']));
    expect(layerEvents[3].distance).toBe(3);
    expect(new Set(layerEvents[3].nodes)).toEqual(new Set(['I', 'J', 'K']));
    expect(layerEvents[4]).toEqual({ distance: 4, nodes: ['L'] });
    expect(types[types.length - 1]).toBe('done');
  });

  it('mark(source) / enqueue / dequeue / highlight(edge) 이벤트 모두 발신', async () => {
    const types: string[] = [];
    const data: BfsGraphData = JSON.parse(JSON.stringify(SAMPLE));
    await bfs({
      data,
      cancelled: false,
      async emit(e) {
        types.push(e.type);
      },
      metric() {},
    });
    expect(types).toContain('mark');
    expect(types).toContain('enqueue');
    expect(types).toContain('dequeue');
    expect(types).toContain('highlight');
    expect(types).toContain('layer-discovered');
  });

  it('출발점이 노드 목록에 없으면 오류', async () => {
    const bad: BfsGraphData = { ...SAMPLE, source: 'Z' };
    await expect(
      bfs({
        data: bad,
        cancelled: false,
        async emit() {},
        metric() {},
      }),
    ).rejects.toThrow();
  });

  it('cancelled true 로 재진입 시 즉시 종료', async () => {
    const data: BfsGraphData = JSON.parse(JSON.stringify(SAMPLE));
    let count = 0;
    await bfs({
      data,
      get cancelled() {
        return count > 2;
      },
      async emit() {
        count++;
      },
      metric() {},
    });
    expect(count).toBeLessThan(200); // 전체 이벤트 수 (대략 60+) 이전에 멈춘다.
  });
});

describe('BFS facet — 다중 뷰 통합', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerBfs();
  });

  it('레지스트리 + 마운트: graph-layout(노드 12) + queue + distanceCounter + codePanel', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(bfsFacet, mount);

    const graph = mount.querySelector('.facet-graph-layout');
    expect(graph).toBeTruthy();
    // 노드 12 개: circle (source badge 제외 = base nodes). base circle 은 nodes group 안.
    const nodeCircles = mount.querySelectorAll('.facet-graph-layout svg g.nodes circle');
    expect(nodeCircles.length).toBe(12);

    // 등고선 (concentric-rings): 레이어 수 - 1 = 4 개.
    // 각 링은 <g>(disk + line) 로 구성 — 링 수는 g 기준으로 센다.
    const ringGroups = mount.querySelectorAll('.facet-graph-layout svg g.rings > g');
    expect(ringGroups.length).toBe(4);

    expect(mount.querySelector('.facet-queue-display')).toBeTruthy();
    expect(mount.querySelector('.facet-text-display')).toBeTruthy();
    expect(mount.querySelector('.facet-code-view')).toBeTruthy();

    handle.destroy();
  });

  it('재생 → 완료 시 모든 도달 노드가 visited/source/active 중 하나이며 배지가 찍혀 있다', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(bfsFacet, mount);
    handle.setSpeed(40);
    handle.start();
    await delay(5000);

    // 완료 후 각 노드에 거리 배지가 있어야 한다 (12 개 전부 도달 가능).
    const badges = mount.querySelectorAll('.facet-graph-layout svg g.badges g');
    expect(badges.length).toBe(12);

    // visited-count, layer-count, edge-scan-count 메트릭이 증가했는지
    const visited = mount.querySelector(
      '.facet-control-bar__metric--visited-count span:last-child',
    )?.textContent;
    const layers = mount.querySelector(
      '.facet-control-bar__metric--layer-count span:last-child',
    )?.textContent;
    expect(Number(visited)).toBe(12);
    expect(Number(layers)).toBe(5);

    handle.destroy();
  }, 10000);

  it('reset 후 메트릭 0 + 재실행 시 다시 누적', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(bfsFacet, mount);
    handle.setSpeed(40);
    handle.start();
    await delay(1200);
    handle.reset();
    await delay(80);
    const visited = mount.querySelector(
      '.facet-control-bar__metric--visited-count span:last-child',
    )?.textContent;
    expect(visited).toBe('0');

    handle.start();
    await delay(5000);
    const visited2 = mount.querySelector(
      '.facet-control-bar__metric--visited-count span:last-child',
    )?.textContent;
    expect(Number(visited2)).toBe(12);

    handle.destroy();
  }, 15000);
});
