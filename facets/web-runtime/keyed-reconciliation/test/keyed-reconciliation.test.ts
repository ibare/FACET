// @vitest-environment happy-dom
/**
 * keyed-reconciliation 고유 검증 — whole-self-check(공통분)가 재지 않는 것.
 *
 *   1. runIR(reconcile) 의 답 = algorithm 이 한 판 끝에 낸 계기 총합, 열다섯 칸 전부.
 *   2. 사양 표(judge-sim.py reconciliation 실측)와 열다섯 칸 모두 대조.
 *   3. 손잡이를 A → B → A 로 돌렸을 때 회차별 계기가 사양 표와 같다(되풀이 대조).
 *   4. 사다리(keyModeIds · changeIds)와 segments[].value 가 맞는다.
 *   5. mountView 를 거쳐 stage 를 마운트하고 한 판을 처음부터 끝까지 흘려도 던지지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView } from '@ffacet/core/runtime';
import { keyedReconciliationAlgorithm } from '../src/algorithm.js';
import { keyedReconciliationImperativeIR } from '../src/irs.js';
import { keyedReconciliationFacet } from '../src/facet.js';
import { keyedReconciliationStageView } from '../src/keyed-reconciliation-stage.js';

type Metrics = { patched: number; created: number; deleted: number; moved: number };

const OLD_ITEMS = ['a', 'b', 'c', 'd', 'e'];
const CHECKED_ITEM = 'b';
const KEY_MODE_IDS = ['none', 'index', 'id'];
const CHANGE_IDS = ['prepend', 'append', 'remove-first', 'reverse', 'retag'];

/** 사양의 "대조 — judge-sim.py reconciliation 실측 그대로" 표. [고침, 만듦, 지움, 옮김]. */
const EXPECTED: Record<string, Record<string, Metrics>> = {
  prepend: {
    none: { patched: 5, created: 2, deleted: 0, moved: 0 },
    index: { patched: 5, created: 2, deleted: 0, moved: 0 },
    id: { patched: 0, created: 2, deleted: 0, moved: 0 },
  },
  append: {
    none: { patched: 0, created: 2, deleted: 0, moved: 0 },
    index: { patched: 0, created: 2, deleted: 0, moved: 0 },
    id: { patched: 0, created: 2, deleted: 0, moved: 0 },
  },
  'remove-first': {
    none: { patched: 4, created: 0, deleted: 2, moved: 0 },
    index: { patched: 4, created: 0, deleted: 2, moved: 0 },
    id: { patched: 0, created: 0, deleted: 2, moved: 0 },
  },
  reverse: {
    none: { patched: 4, created: 0, deleted: 0, moved: 0 },
    index: { patched: 4, created: 0, deleted: 0, moved: 0 },
    id: { patched: 0, created: 0, deleted: 0, moved: 4 },
  },
  retag: {
    none: { patched: 0, created: 11, deleted: 11, moved: 0 },
    index: { patched: 0, created: 11, deleted: 11, moved: 0 },
    id: { patched: 0, created: 11, deleted: 11, moved: 0 },
  },
};

function newItemsOf(changeId: string): string[] {
  switch (changeId) {
    case 'prepend':
      return ['x', ...OLD_ITEMS];
    case 'append':
      return [...OLD_ITEMS, 'x'];
    case 'remove-first':
      return OLD_ITEMS.slice(1);
    case 'reverse':
      return [...OLD_ITEMS].reverse();
    case 'retag':
      return [...OLD_ITEMS];
    default:
      throw new Error(changeId);
  }
}

function irMetricsOf(changeId: string, keyModeId: string): Metrics {
  const newItems = newItemsOf(changeId);
  const sameTag = changeId !== 'retag';
  const keyed = sameTag && keyModeId === 'id';
  const usedOut = new Array(OLD_ITEMS.length).fill(0) as number[];
  const resultOut = [0, 0, 0, 0];
  runIR(keyedReconciliationImperativeIR, 'reconcile', [OLD_ITEMS, newItems, sameTag, keyed, usedOut, resultOut]);
  return { patched: resultOut[0]!, created: resultOut[1]!, deleted: resultOut[2]!, moved: resultOut[3]! };
}

/** algorithm 을 fake ctx 로 돌려 입력 차례대로 한 판씩 재생하고 회차별 계기를 모은다. */
async function driveAlgorithm(inputs: { type: string; payload: { value: number } }[]): Promise<Metrics[]> {
  const totals: Metrics = { patched: 0, created: 0, deleted: 0, moved: 0 };
  const rounds: Metrics[] = [];
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const waiting = new Promise<void>((resolve) => (idle = resolve));
  const close = (): void => {
    rounds.push({ ...totals });
  };
  const ctx = {
    data: {
      type: 'keyedReconciliation' as const,
      stepMs: 5,
      oldItems: OLD_ITEMS,
      checkedItem: CHECKED_ITEM,
      keyModeIds: KEY_MODE_IDS,
      changeIds: CHANGE_IDS,
    },
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc'): void {
      const key = name as keyof Metrics;
      totals[key] += delta === 'inc' ? 1 : delta;
    },
    async emit(): Promise<void> {
      /* 계기만 본다 — 이벤트 내용은 whole-self-check 몫 */
    },
    async sleep(): Promise<boolean> {
      return !cancelled;
    },
    async waitForInput(): Promise<{ type: string; payload: { value: number } }> {
      close();
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      return next;
    },
    pollInput(): null {
      return null;
    },
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('20 초 안에 입력 대기에 닿지 않았다')), 20_000);
  });
  try {
    await Promise.race([
      keyedReconciliationAlgorithm(ctx as never).then(() => close()),
      waiting,
      cap,
    ]);
  } finally {
    clearTimeout(timer);
    cancelled = true;
  }
  return rounds;
}

describe('keyed-reconciliation — IR ↔ algorithm ↔ 사양 표', () => {
  it('IR 의 답이 사양 표와 열다섯 칸 모두 같다', () => {
    for (const changeId of CHANGE_IDS) {
      for (const keyModeId of KEY_MODE_IDS) {
        expect(irMetricsOf(changeId, keyModeId), `${changeId} × ${keyModeId}`).toEqual(
          EXPECTED[changeId]![keyModeId]!,
        );
      }
    }
  });

  it('algorithm 이 한 판 끝에 내는 계기가 IR · 사양 표와 열다섯 칸 모두 같다', async () => {
    const inputs: { type: string; payload: { value: number } }[] = [];
    // 첫 판은 기본값(keyMode=0/none, change=0/prepend) — 입력 없이 이미 사양 표의 그 칸.
    // 나머지 열넷은 두 손잡이를 조합해 순서대로 돌린다.
    const combos: { changeId: string; keyModeId: string }[] = [];
    for (const changeId of CHANGE_IDS) {
      for (const keyModeId of KEY_MODE_IDS) {
        if (changeId === 'prepend' && keyModeId === 'none') continue; // 이미 기본 판
        combos.push({ changeId, keyModeId });
      }
    }
    for (const { changeId, keyModeId } of combos) {
      inputs.push({ type: 'keyMode', payload: { value: KEY_MODE_IDS.indexOf(keyModeId) } });
      inputs.push({ type: 'change', payload: { value: CHANGE_IDS.indexOf(changeId) } });
    }
    const rounds = await driveAlgorithm(inputs);
    // round0 = 기본값
    expect(rounds[0], 'prepend × none (기본판)').toEqual(EXPECTED.prepend!.none);
    // 그 뒤로는 입력 둘(keyMode, change)마다 한 판씩 늘어난다 — 둘째 입력 뒤의 판이 그 조합의 결과.
    let roundIndex = 0;
    for (const { changeId, keyModeId } of combos) {
      roundIndex += 2;
      expect(rounds[roundIndex], `${changeId} × ${keyModeId}`).toEqual(EXPECTED[changeId]![keyModeId]!);
    }
  });

  it('손잡이를 A → B → A 로 되돌리면 계기가 처음 판과 같다(되짚기가 아니어도 판마다 안 쌓인다)', async () => {
    const rounds = await driveAlgorithm([
      { type: 'change', payload: { value: CHANGE_IDS.indexOf('reverse') } }, // reverse × none
      { type: 'keyMode', payload: { value: KEY_MODE_IDS.indexOf('id') } }, // reverse × id
      { type: 'keyMode', payload: { value: KEY_MODE_IDS.indexOf('none') } }, // reverse × none — A 로 되돌림
    ]);
    // rounds[0] = 기본판(prepend × none), rounds[1] = 첫 입력 뒤(reverse × none, A),
    // rounds[2] = 둘째 입력 뒤(reverse × id, B), rounds[3] = 셋째 입력 뒤(reverse × none, A 로 되돌림).
    expect(rounds[0], '기본판(prepend × none)').toEqual(EXPECTED.prepend!.none);
    expect(rounds[1], 'reverse × none (A)').toEqual(EXPECTED.reverse!.none);
    expect(rounds[2], 'reverse × id (B)').toEqual(EXPECTED.reverse!.id);
    expect(rounds[3], 'reverse × none (A 로 되돌린 판)').toEqual(rounds[1]);
  });

  it('사다리(keyModeIds · changeIds)가 segments[].value 와 맞는다', () => {
    const controlsBlock = keyedReconciliationFacet.blocks.controls as unknown as {
      controls: { action: string; segments: { value: number }[] }[];
    };
    const controls = controlsBlock.controls;
    const keyModeControl = controls.find((c) => c.action === 'keyMode');
    const changeControl = controls.find((c) => c.action === 'change');
    expect(keyModeControl?.segments.map((s) => s.value)).toEqual([0, 1, 2]);
    expect(changeControl?.segments.map((s) => s.value)).toEqual([0, 1, 2, 3, 4]);
    const data = keyedReconciliationFacet.initialData as unknown as { keyModeIds: string[]; changeIds: string[] };
    expect(data.keyModeIds).toHaveLength(3);
    expect(data.changeIds).toHaveLength(5);
  });

  it('mountView 로 stage 를 마운트하고 한 판(태그가 바뀌는 가장 긴 판)을 처음부터 끝까지 흘려도 던지지 않는다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(keyedReconciliationStageView, container, {
      config: { type: 'keyed-reconciliation-stage' },
      initialData: keyedReconciliationFacet.initialData,
      locale: 'en',
    }) as {
      roundStart(payload: unknown): void;
      applyStep(payload: unknown, durationMs: number): void;
      roundEnd(): void;
      destroy(): void;
    };
    expect(() => {
      instance.roundStart({
        oldItems: OLD_ITEMS,
        newItems: [...OLD_ITEMS],
        oldTag: 'ul',
        newTag: 'ol',
        checkedItem: CHECKED_ITEM,
        checkedSlot: `p:${OLD_ITEMS.indexOf(CHECKED_ITEM)}`,
        keyModeId: 'none',
        changeId: 'retag',
      });
      instance.applyStep({ kind: 'delete', slots: OLD_ITEMS.map((_, i) => `p:${i}`), branch: true }, 0);
      for (let i = 0; i < OLD_ITEMS.length; i += 1) {
        instance.applyStep({ kind: 'create', slot: `p:${i}`, atIndex: i, text: OLD_ITEMS[i]!, branch: i === 0 }, 0);
      }
      instance.roundEnd();
    }).not.toThrow();
    expect(container.querySelector('svg')).not.toBeNull();
    instance.destroy();
  });

  it('mountView 는 initialData 없이 마운트해도 던지지 않는다 (전수 검사가 config: {} 만 준다)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(keyedReconciliationStageView, container, { config: {} });
    expect(instance).toBeDefined();
    instance.destroy();
  });
});
