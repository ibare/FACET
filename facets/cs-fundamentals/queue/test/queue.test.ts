// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import {
  queue,
  computeQueueResult,
  registerQueue,
  queueFacet,
  type QueueFacetData,
} from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

const SAMPLE: QueueFacetData = {
  type: 'queue',
  initialValues: ['A', 'B', 'C'],
  capacity: 10,
  scenario: [
    { op: 'enqueue', value: 'D' },
    { op: 'dequeue' },
    { op: 'peek' },
    { op: 'enqueue', value: 'E' },
  ],
};

describe('queue 알고리즘 자체', () => {
  it('computeQueueResult 는 시나리오 후 큐 최종 상태를 계산한다', () => {
    const r = computeQueueResult(SAMPLE);
    // 초기 [A,B,C] + D enqueue → [A,B,C,D] → dequeue → [B,C,D] → peek (변화없음) → E enqueue → [B,C,D,E]
    expect(r.finalValues).toEqual(['B', 'C', 'D', 'E']);
    expect(r.totalEnqueued).toBe(5); // A,B,C,D,E
    expect(r.totalDequeued).toBe(1);
    expect(r.overflowCount).toBe(0);
    expect(r.underflowCount).toBe(0);
  });

  it('bounded capacity 초과 enqueue 는 overflow 로 카운트', () => {
    const r = computeQueueResult({
      type: 'queue',
      initialValues: ['A', 'B'],
      capacity: 2,
      scenario: [{ op: 'enqueue', value: 'C' }],
    });
    expect(r.finalValues).toEqual(['A', 'B']);
    expect(r.overflowCount).toBe(1);
  });

  it('빈 큐 dequeue / peek 은 underflow 로 카운트', () => {
    const r = computeQueueResult({
      type: 'queue',
      initialValues: [],
      capacity: null,
      scenario: [{ op: 'dequeue' }, { op: 'peek' }],
    });
    expect(r.underflowCount).toBe(2);
  });

  it('enqueue / dequeue / peek / overflow / underflow 이벤트를 모두 발신', async () => {
    const types: string[] = [];
    const data: QueueFacetData = {
      type: 'queue',
      initialValues: [],
      capacity: 1,
      scenario: [
        { op: 'dequeue' }, // underflow
        { op: 'enqueue', value: 'A' },
        { op: 'enqueue', value: 'B' }, // overflow (cap=1)
        { op: 'peek' },
        { op: 'dequeue' },
      ],
    };
    await queue({
      data,
      cancelled: false,
      async emit(e) {
        types.push(e.type);
      },
      metric() {},
    });
    expect(types).toContain('underflow');
    expect(types).toContain('enqueue');
    expect(types).toContain('overflow');
    expect(types).toContain('peek');
    expect(types).toContain('dequeue');
    expect(types[types.length - 1]).toBe('done');
  });

  it('입장 스탬프는 단조증가이고 dequeue payload 의 stamp 도 같은 순서로 방출', async () => {
    const enqueueStamps: number[] = [];
    const dequeueStamps: number[] = [];
    await queue({
      data: SAMPLE,
      cancelled: false,
      async emit(e) {
        if (e.type === 'enqueue') {
          const p = e.payload as { stamp: number };
          enqueueStamps.push(p.stamp);
        }
        if (e.type === 'dequeue') {
          const p = e.payload as { stamp: number };
          dequeueStamps.push(p.stamp);
        }
      },
      metric() {},
    });
    expect(enqueueStamps).toEqual([1, 2, 3, 4, 5]); // 초기 A,B,C + 시나리오 D,E
    expect(dequeueStamps).toEqual([1]); // A 가 가장 먼저 떠난다 (FIFO)
  });

  it('cancelled true 면 즉시 종료', async () => {
    let count = 0;
    await queue({
      data: SAMPLE,
      get cancelled() {
        return count > 2;
      },
      async emit() {
        count++;
      },
      metric() {},
    });
    expect(count).toBeLessThan(60);
  });
});

describe('Queue facet — conveyor-queue + code 뷰 통합', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerQueue();
  });

  it('마운트 시 conveyor-queue + code-view 가 생성된다', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(queueFacet, mount);

    expect(mount.querySelector('.facet-conveyor-queue')).toBeTruthy();
    expect(mount.querySelector('.facet-code-view')).toBeTruthy();

    handle.destroy();
  });

  it('재생 완료 시 enqueue-count / dequeue-count 메트릭이 증가', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(queueFacet, mount);
    handle.setSpeed(40);
    handle.start();
    await delay(3000);

    const enq = mount.querySelector(
      '.facet-control-bar__metric--enqueue-count span:last-child',
    )?.textContent;
    const deq = mount.querySelector(
      '.facet-control-bar__metric--dequeue-count span:last-child',
    )?.textContent;
    // 초기 A,B,C (3) + 시나리오 D,E,F,G (4) = 7 enqueue
    expect(Number(enq)).toBe(7);
    // 시나리오의 dequeue 5 회 중 빈 큐 시점 (마지막 dequeue) 에서 underflow 가 발생하므로 실제 dequeue 는 4 회.
    expect(Number(deq)).toBeGreaterThanOrEqual(4);

    handle.destroy();
  }, 8000);

  it('reset 후 메트릭이 0 으로 복원', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(queueFacet, mount);
    handle.setSpeed(40);
    handle.start();
    await delay(1200);
    handle.reset();
    await delay(80);

    const enq = mount.querySelector(
      '.facet-control-bar__metric--enqueue-count span:last-child',
    )?.textContent;
    expect(enq).toBe('0');

    handle.destroy();
  }, 8000);
});
