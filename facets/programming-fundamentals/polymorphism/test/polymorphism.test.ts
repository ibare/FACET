// @vitest-environment happy-dom
/**
 * polymorphism — facet 고유의 주장.
 *
 * IR 을 두지 않으므로(irs.ts) IR ↔ algorithm 대조는 없다. 대신 알고리즘을 실제로 돌려
 * 손잡이 아홉 조합이 사양 표와 같은지, 회차별 계기, 사다리, 던지는 자리, 화면의 캡션을 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  lookup,
  polymorphismAlgorithm,
  polymorphismFacet,
  polymorphismIRs,
  polymorphismProjector,
  polymorphismStageView,
  type PolymorphismData,
} from '../src/index.js';

const base = (): PolymorphismData => JSON.parse(JSON.stringify(polymorphismFacet.initialData)) as PolymorphismData;

type Input = { type: string; payload: { value: number } };
type Round = { events: FacetRuntimeEvent[]; metrics: Map<string, number>; steps: number };

/** 알고리즘을 입력 차례대로 돌려 판마다 모은다. 걸음 = sleep 과 입력 대기. */
async function drive(data: PolymorphismData, inputs: Input[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals = new Map<string, number>();
  let cur: Round = { events: [], metrics: totals, steps: 0 };
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const done = new Promise<void>((r) => (idle = r));
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc'): void {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(e: FacetRuntimeEvent): Promise<void> {
      cur.events.push(e);
    },
    async sleep(): Promise<boolean> {
      cur.steps += 1;
      return !cancelled;
    },
    async waitForInput(): Promise<Input> {
      cur.steps += 1;
      rounds.push({ ...cur, metrics: new Map(totals) });
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      cur = { events: [], metrics: totals, steps: 0 };
      return next;
    },
    pollInput: () => null,
  };
  await Promise.race([polymorphismAlgorithm(ctx as never), done]);
  cancelled = true;
  return rounds;
}

const pay = (e: FacetRuntimeEvent): Record<string, unknown> => e.payload as Record<string, unknown>;

// 사양 표 (sim.py polymorphism) — 대조용. 구조에서 셈한 값과 견준다.
const SPEC: [string, string, string | null, string, string[], number, number | null, number, boolean, number][] = [
  // 받는 객체, 이름, 도는 몸, 출력, 들여다본 차례, looked, 올라간 층, errors, 칸 꽂힘, 걸음
  ['Shape', 'area', 'Shape', 'unknown area', ['Shape'], 1, 0, 0, true, 4],
  ['Shape', 'corners', null, 'NoMethod', ['Shape'], 1, null, 1, false, 4],
  ['Shape', 'label', 'Shape', 'shape', ['Shape'], 1, 0, 0, true, 4],
  ['Polygon', 'area', 'Shape', 'unknown area', ['Polygon', 'Shape'], 2, 1, 0, true, 5],
  ['Polygon', 'corners', 'Polygon', 'has corners', ['Polygon'], 1, 0, 0, false, 4],
  ['Polygon', 'label', 'Polygon', 'polygon', ['Polygon'], 1, 0, 0, true, 4],
  ['Square', 'area', 'Square', 'side * side', ['Square'], 1, 0, 0, true, 4],
  ['Square', 'corners', 'Polygon', 'has corners', ['Square', 'Polygon'], 2, 1, 0, false, 5],
  ['Square', 'label', 'Polygon', 'polygon', ['Square', 'Polygon'], 2, 1, 0, true, 5],
];

describe('polymorphism', () => {
  it('IR 을 두지 않는다 — 코드 패널도 없다', () => {
    expect(polymorphismIRs).toEqual([]);
    expect(Object.values(polymorphismFacet.blocks).some((b) => b.type === 'code-view')).toBe(false);
  });

  it('사다리가 segments[].value 와 같다', () => {
    const data = base();
    expect(data.receivers).toEqual(['Shape', 'Polygon', 'Square']);
    expect(data.methods).toEqual(['area', 'corners', 'label']);
    const controls = (polymorphismFacet.blocks.controls as { controls: { action: string; segments?: { value: number; label: unknown; default?: boolean }[] }[] }).controls;
    const seg = (a: string) => controls.find((c) => c.action === a)!.segments!;
    expect(seg('receiver').map((s) => s.value)).toEqual(data.receivers.map((_, i) => i));
    expect(seg('receiver').map((s) => s.label)).toEqual(data.receivers);
    expect(seg('method').map((s) => s.value)).toEqual(data.methods.map((_, i) => i));
    expect(seg('method').map((s) => s.label)).toEqual(data.methods);
    expect(seg('receiver').find((s) => s.default)!.value).toBe(data.receiver);
    expect(seg('method').find((s) => s.default)!.value).toBe(data.method);
  });

  it('아홉 조합 모두 사양 표와 같다 — 알고리즘을 돌려서', async () => {
    for (const [recv, name, owner, out, order, looked, levels, errors, slot, steps] of SPEC) {
      const data = base();
      data.receiver = data.receivers.indexOf(recv);
      data.method = data.methods.indexOf(name);
      const [r] = await drive(data, []);
      const tag = `${recv}×${name}`;
      expect(r!.steps, tag).toBe(steps);
      expect(r!.steps, tag).toBe(3 + looked);
      const looks = r!.events.filter((e) => e.type === 'look');
      expect(looks.map((e) => pay(e).cls), tag).toEqual(order);
      expect(looks.map((e) => pay(e).looked), tag).toEqual(order.map((_, i) => i + 1));
      expect(r!.metrics.get('classes-looked'), tag).toBe(looked);
      expect(r!.metrics.get('lookup-errors'), tag).toBe(errors);
      const end = r!.events[r!.events.length - 1]!;
      if (owner === null) {
        expect(end.type, tag).toBe('fail');
        expect(looks.every((e) => pay(e).found === false), tag).toBe(true);
        expect(out).toBe('NoMethod');
      } else {
        expect(end.type, tag).toBe('run');
        expect(pay(end), tag).toEqual({ owner, method: name, out, levels, slot });
        expect(looks.map((e) => pay(e).found), tag).toEqual(order.map((c) => c === owner));
      }
      // 순수 셈과도 같다
      const lk = lookup(data, recv, name);
      expect(lk.visited, tag).toEqual(order);
      expect(lk.owner, tag).toBe(owner);
    }
  });

  it('약속 이름은 받는 객체 셋 모두에서 찾아지고(0/3), corners 는 1/3 실패한다', () => {
    const data = base();
    const fails = (m: string) => data.receivers.filter((r) => lookup(data, r, m).owner === null).length;
    expect(fails('area')).toBe(0);
    expect(fails('label')).toBe(0);
    expect(fails('corners')).toBe(1);
  });

  it('회차별 계기 — Square×label → Shape×corners → Square×label', async () => {
    const rounds = await drive(base(), [
      { type: 'receiver', payload: { value: 0 } },
      { type: 'method', payload: { value: 1 } },
      { type: 'receiver', payload: { value: 2 } },
      { type: 'method', payload: { value: 2 } },
    ]);
    const m = rounds.map((r) => [r.metrics.get('classes-looked'), r.metrics.get('lookup-errors')]);
    expect(m[0]).toEqual([2, 0]); // Square×label
    expect(m[2]).toEqual([1, 1]); // Shape×corners
    expect(m[4]).toEqual([2, 0]); // Square×label
  });

  it('우리 것이 아닌 입력은 흘리고, 사다리 밖 값은 던진다', async () => {
    const rounds = await drive(base(), [{ type: 'other', payload: { value: 0 } } as Input, { type: 'method', payload: { value: 0 } }]);
    // 흘린 입력 뒤에는 발신이 없고 다시 기다린다. 그다음 입력에서 판이 돈다
    expect(rounds.length).toBe(3);
    expect(rounds[1]!.events).toEqual([]);
    expect(rounds[2]!.events.length).toBeGreaterThan(0);
    await expect(drive(base(), [{ type: 'receiver', payload: { value: 3 } }])).rejects.toThrow(/사다리 밖/);
  });

  it('모르는 클래스 · 부모 사슬의 고리는 던진다', () => {
    const d1 = base();
    d1.classes[2]!.parent = 'Nothing';
    expect(() => lookup(d1, 'Square', 'label')).toThrow(/모르는 클래스/);
    const d2 = base();
    d2.classes[0]!.parent = 'Square';
    expect(() => lookup(d2, 'Square', 'corners')).not.toThrow();
    expect(() => lookup(d2, 'Shape', 'nothing')).toThrow(/고리/);
  });

  it('화면 — 캡션의 수가 셈한 값이다', async () => {
    const container = document.createElement('div');
    const stage = mountView(polymorphismStageView, container, { config: {}, initialData: polymorphismFacet.initialData, locale: 'en' });
    const proj = polymorphismProjector({ stage }, { getSpeed: () => 1, t: (_k, en, vars) => en.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? '')) });
    proj.onInit?.(polymorphismFacet.initialData);
    const data = base();
    data.receiver = 1; // Polygon × area → Shape 에서 찾음
    data.method = 0;
    const [r] = await drive(data, []);
    const seen: string[] = [];
    for (const e of r!.events) {
      await proj.onEvent(e);
      seen.push(container.textContent ?? '');
    }
    const last = seen[seen.length - 1]!;
    expect(last).toContain('Output: unknown area');
    expect(last).toContain('Levels up: 1');
    expect(last).toContain('s.area()');
    expect(last).toContain('let s = new Polygon()');
    expect(seen.some((s) => s.includes('Classes looked: 2'))).toBe(true);
    stage.destroy();
  });

  it('마운트는 initialData 없이도 던지지 않는다', () => {
    const container = document.createElement('div');
    const stage = mountView(polymorphismStageView, container, { config: {} });
    expect(() => stage.destroy()).not.toThrow();
  });
});
