// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  barChartView,
  graphLayoutView,
  treeLayoutView,
  linkedListChainView,
  queueDisplayView,
  orderedListView,
  codeViewView,
} from '../src/views/index.js';
import type { ViewInstance } from '../src/views/types.js';

function mountView(
  view: { mount(c: HTMLElement, p: { config: Record<string, unknown> }): ViewInstance },
  config: Record<string, unknown> = {},
): { container: HTMLElement; instance: ViewInstance } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const instance = view.mount(container, { config });
  return { container, instance };
}

describe('bar-chart', () => {
  it('데이터 설정 + 상태 변경 + swap', () => {
    const { container, instance } = mountView(barChartView, { type: 'bar-chart' });
    (instance.setData as (a: number[]) => void)([5, 2, 8]);
    expect(container.querySelectorAll('rect').length).toBe(3);
    (instance.setItemState as (i: number, s: string) => void)(0, 'comparing');
    (instance.swapItems as (i: number, j: number) => void)(0, 2);
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels).toEqual(['8', '2', '5']);
    (instance.reset as () => void)();
    expect(container.querySelectorAll('rect').length).toBe(0);
    instance.destroy();
  });
});

describe('graph-layout', () => {
  it('노드/엣지 렌더 + 상태', () => {
    const { container, instance } = mountView(graphLayoutView, { type: 'graph-layout' });
    (instance.setGraph as (d: unknown, p: unknown) => void)(
      { nodes: [{ id: 'A' }, { id: 'B' }], edges: [{ from: 'A', to: 'B' }] },
      { A: { x: 50, y: 50 }, B: { x: 200, y: 50 } },
    );
    expect(container.querySelectorAll('circle').length).toBe(2);
    expect(container.querySelectorAll('line').length).toBe(1);
    (instance.setNodeState as (id: string, s: string) => void)('A', 'visited');
    (instance.setEdgeState as (a: string, b: string, s: string) => void)('A', 'B', 'traversed');
    instance.destroy();
  });
});

describe('tree-layout', () => {
  it('트리 자동 배치 + addNode', () => {
    const { container, instance } = mountView(treeLayoutView, { type: 'tree-layout' });
    (instance.setTree as (n: unknown) => void)({
      id: 'root',
      children: [{ id: 'a' }, { id: 'b' }],
    });
    expect(container.querySelectorAll('circle').length).toBe(3);
    (instance.addNode as (p: string, c: unknown) => void)('a', { id: 'a1' });
    expect(container.querySelectorAll('circle').length).toBe(4);
    instance.destroy();
  });
});

describe('linked-list-chain', () => {
  it('리스트 + 상태 + 삽입', () => {
    const { container, instance } = mountView(linkedListChainView, { type: 'linked-list-chain' });
    (instance.setList as (a: unknown[]) => void)([1, 2, 3]);
    expect(container.querySelectorAll('.facet-linked-list__node').length).toBe(3);
    (instance.insertAt as (i: number, v: unknown) => void)(1, 99);
    expect(container.querySelectorAll('.facet-linked-list__node').length).toBe(4);
    instance.destroy();
  });
});

describe('queue-display', () => {
  it('enqueue / dequeue / size', () => {
    const { container, instance } = mountView(queueDisplayView, { type: 'queue-display' });
    expect(instance.size).toBe(0);
    (instance.enqueue as (v: unknown) => void)('A');
    (instance.enqueue as (v: unknown) => void)('B');
    expect(instance.size).toBe(2);
    const removed = (instance.dequeue as () => unknown)();
    expect(removed).toBe('A');
    expect(instance.size).toBe(1);
    expect(container.textContent).toContain('B');
    instance.destroy();
  });
});

describe('ordered-list', () => {
  it('append + reset', () => {
    const { container, instance } = mountView(orderedListView, { type: 'ordered-list' });
    (instance.append as (v: unknown) => void)('first');
    (instance.append as (v: unknown) => void)('second');
    expect(container.querySelectorAll('li').length).toBe(2);
    (instance.reset as () => void)();
    expect(container.querySelectorAll('li').length).toBe(0);
    instance.destroy();
  });
});

describe('code-view', () => {
  it('소스 + phase 하이라이트', () => {
    const { container, instance } = mountView(codeViewView, { type: 'code-view' });
    (instance.setSource as (lines: { code: string; phase: string | null }[]) => void)([
      { code: 'def foo():', phase: null },
      { code: '  return 1', phase: 'return' },
    ]);
    const lines = container.querySelectorAll('.facet-code-view__line');
    expect(lines.length).toBe(2);
    (instance.highlightPhase as (p: string | null) => void)('return');
    expect((lines[1] as HTMLElement).style.backgroundColor).not.toBe('');
    (instance.clearHighlight as () => void)();
    expect((lines[1] as HTMLElement).style.backgroundColor).toBe('');
    instance.destroy();
  });

  it('_transpiledLines 자동 적용', () => {
    const { container, instance } = mountView(codeViewView, {
      type: 'code-view',
      _transpiledLines: [
        { code: 'a = 1', phase: 'init' },
        { code: 'a += 1', phase: 'step' },
      ],
    });
    expect(container.querySelectorAll('.facet-code-view__line').length).toBe(2);
    instance.destroy();
  });
});
