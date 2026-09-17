/**
 * 커널 트릭 조각 — 알고리즘.
 *
 * 질문: 직선으로 도저히 못 가르는 것은 어떻게 하는가.
 *
 * 동사는 **들어올린다** 이다. 다만 들어올리기 전에 할 일이 있다 — 한 줄 위에서는
 * 자름 자리를 어디로 옮겨도 한쪽에 두 이름표가 함께 남는다는 것을 **다 해 보고**
 * 나서 올린다. 순서가 논증이다. 못 가른다는 것을 보이지 않고 올리면 그것은
 * 시연이지 논증이 아니다.
 *
 * 화면에 뜨는 수는 전부 여기서 셈한다. 선언에 있는 것은 구조뿐이다 — 점의 자리와
 * 이름표, 그리고 올리는 법(제곱). 자름 자리도 · 오르는 높이도 · 가르는 높이도
 * 파생값이라 선언에 없다 (S-piece).
 *
 * ── 이벤트 (전부 이 facet 고유. silent 는 하나도 없다 — 모두 화면이 바뀐다)
 *
 * payload 는 **올리는 법이 내놓는 판정만** 싣는다. 자름 자리도 · 몇 번째 자리인가도 ·
 * 양쪽에 남은 이름표도 점에서 곧바로 세지는 것이라 장면이 센다 (S-scene).
 *
 *   line-shown      {}
 *       한 줄 위의 점들이 자리를 잡는다.
 *   cut-tried       {}
 *       자름 자리 하나를 짚는다. 어느 자리인지는 `kernelCutsOf` 가 정하고 몇 번째인지는
 *       장면이 센다. 양쪽에 어떤 이름표가 남는지도 점과 그 자리에서 나온다.
 *   cut-exhausted   {}
 *       자를 수 있는 자리를 다 해 봤고 되는 것이 없었다. 몇 자리였는지는 장면이 센다.
 *   height-opened   { ticks: number[] }
 *       없던 쪽(위)을 연다. ticks 는 실제로 나오는 높이들(오름차순) — 올리는 법이
 *       정하는 값이라 장면이 셈할 수 없다.
 *   point-raised    { xs: number[]; height: number }
 *       같은 높이로 오르는 것끼리 함께 오른다. 낮은 것부터. 오른 높이가 곧 올리는
 *       법의 답이라 싣는다.
 *   curve-traced    {}
 *       앉은 자리를 이으면 굽어 있다.
 *   cut-placed      { height: number }
 *       곧은 선 하나가 내려와 그 높이에서 멈춘다.
 *   split-verified  {}
 *       아래는 한 이름표, 위는 다른 이름표. 어느 이름표가 어느 쪽인지는 오른 높이와
 *       가르는 높이를 견주면 나오므로 장면이 센다 — 그림과 같은 자료를 쓴다.
 *   rewind          {}
 *       되감기. 자동 재생이 끝난 뒤 처음 누르는 `advance` 가 이것을 내고
 *       곧바로 첫 걸음(line-shown)까지 간다 (S-piece).
 *   done            {}
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type KernelLiftsPointSpec = {
  /** 한 줄 위의 자리. */
  x: number;
  /** 이름표. 둘뿐이라고 보고, 셋 이상이면 던진다. */
  label: string;
};

export type KernelLiftsData = {
  type: string;
  points: KernelLiftsPointSpec[];
  /** 올리는 법. x → (x, x^power). */
  lift: { power: number };
  /** 걸음 간격 (S-piece — 읽을 시간은 저작 결정이다). */
  stepMs: number;
};

/** 같은 높이로 오르는 무리. */
type Rise = { height: number; xs: number[] };

function sortedByX(points: KernelLiftsPointSpec[]): KernelLiftsPointSpec[] {
  return [...points].sort((a, b) => a.x - b.x);
}

/**
 * 한 줄 위에서 서로 다른 결과를 내는 자름 자리 **전부**, 왼쪽부터.
 *
 * 이웃한 두 점 사이의 한가운데가 그것이다. 그 사이 어디를 잘라도 양쪽에 담기는
 * 것이 같으므로, 이 목록을 다 해 보는 것이 곧 모든 자름을 해 보는 것이다.
 * 손으로 고른 자리가 아니라 데이터가 정하는 자리다 (S-piece).
 *
 * 장면도 이것을 부른다 — 몇 번째 자리를 짚는 중인지는 장면이 세고 그 자리가
 * 어디인지는 이 함수가 정한다. 걸음이 자리를 실어 보내면 같은 물음에 답이 둘이
 * 된다. 올리는 법과는 무관한 함수라 내주어도 조각의 주장이 남는다.
 */
export function kernelCutsOf(points: readonly KernelLiftsPointSpec[]): number[] {
  const sorted = sortedByX([...points]);
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1].x;
    const cur = sorted[i].x;
    if (cur === prev) continue;
    out.push((prev + cur) / 2);
  }
  return out;
}

/** 올린 높이. 제 자리를 제곱한 만큼이다. */
function heightOf(x: number, power: number): number {
  return x ** power;
}

/**
 * 오르는 순서 — 낮은 것부터, 같은 높이는 함께.
 *
 * 손으로 적은 걸음표가 아니라 높이로 정렬한 결과다. 그래서 가운데 것이 먼저
 * (거의 안 오르고) 바깥 것이 나중에 (크게) 오른다 — 그 차이가 갈라짐을 만든다.
 */
function risesOf(sorted: KernelLiftsPointSpec[], power: number): Rise[] {
  const byHeight = new Map<number, number[]>();
  for (const p of sorted) {
    const h = heightOf(p.x, power);
    const xs = byHeight.get(h);
    if (xs) xs.push(p.x);
    else byHeight.set(h, [p.x]);
  }
  return [...byHeight.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([height, xs]) => ({ height, xs }));
}

/** 실제로 나오는 높이들 — 높이 축의 눈금이 된다. */
function heightTicksOf(rises: Rise[]): number[] {
  return rises.map((r) => r.height);
}

/**
 * 올린 뒤 두 이름표를 가르는 높이.
 *
 * 한 이름표의 가장 높은 것이 다른 이름표의 가장 낮은 것보다 아래여야 한다.
 * 그 둘의 한가운데가 가르는 높이다. 어느 이름표가 아래인지는 돌려주지 않는다 —
 * 오른 높이와 이 높이를 견주면 나오므로 장면이 센다.
 */
function separatorHeightOf(sorted: KernelLiftsPointSpec[], power: number): number {
  const span = new Map<string, { min: number; max: number }>();
  for (const p of sorted) {
    const h = heightOf(p.x, power);
    const cur = span.get(p.label);
    if (cur) {
      cur.min = Math.min(cur.min, h);
      cur.max = Math.max(cur.max, h);
    } else {
      span.set(p.label, { min: h, max: h });
    }
  }
  const labels = [...span.keys()].sort();
  if (labels.length !== 2) {
    throw new Error(`커널 조각은 이름표 둘을 전제한다: ${labels.join(', ') || '없음'}`);
  }
  const first = labels[0];
  const second = labels[1];
  const a = span.get(first)!;
  const b = span.get(second)!;
  if (a.max < b.min) return (a.max + b.min) / 2;
  if (b.max < a.min) return (b.max + a.min) / 2;
  throw new Error(
    `들어올려도 높이 하나로 갈리지 않는다: ${first} [${a.min}, ${a.max}] · ${second} [${b.min}, ${b.max}]`,
  );
}

export const kernelLifts = async (ctx: FacetContext<KernelLiftsData>): Promise<void> => {
  const rc = ctx as ReactiveContext<KernelLiftsData>;
  const { points, lift, stepMs } = rc.data;

  const sorted = sortedByX(points);
  const cuts = kernelCutsOf(sorted);
  const rises = risesOf(sorted, lift.power);
  const ticks = heightTicksOf(rises);
  const separatorHeight = separatorHeightOf(sorted, lift.power);

  /** 자동 재생이 끝나면 참이 된다. 그 뒤로는 `advance` 가 걸음을 민다. */
  let manual = false;

  /** 걸음 **사이**의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  async function gate(): Promise<boolean> {
    if (rc.cancelled) return false;
    if (!manual) return rc.sleep(stepMs);
    for (;;) {
      if (rc.cancelled) return false;
      const input = await rc.waitForInput();
      if (input.type !== 'advance') continue;
      return !rc.cancelled;
    }
  }

  /** 한 바퀴. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  async function pass(): Promise<boolean> {
    if (rc.cancelled) return false;
    // 첫 걸음 앞에는 문을 두지 않는다. 문은 걸음 **사이**의 것이라 여기서는
    // 기다릴 앞걸음이 없고, 기다리면 두 가지가 어긋난다 — 마운트 직후 화면이
    // 한 박자 비고, 되감기 뒤 처음 누른 `advance` 가 되감기만 하고 멈춘다
    // (S-piece 의 "첫 누름은 되감고 첫 걸음까지").
    await rc.emit({ type: 'line-shown', payload: {} });

    // 자리마다 한 걸음. 자리는 데이터가 정하고 몇 번째인지는 장면이 센다.
    for (let i = 0; i < cuts.length; i += 1) {
      if (!(await gate())) return false;
      await rc.emit({ type: 'cut-tried', payload: {} });
    }

    if (!(await gate())) return false;
    await rc.emit({ type: 'cut-exhausted', payload: {} });

    if (!(await gate())) return false;
    await rc.emit({ type: 'height-opened', payload: { ticks } });

    for (const rise of rises) {
      if (!(await gate())) return false;
      await rc.emit({
        type: 'point-raised',
        payload: { xs: rise.xs, height: rise.height },
      });
    }

    if (!(await gate())) return false;
    await rc.emit({ type: 'curve-traced', payload: {} });

    if (!(await gate())) return false;
    await rc.emit({ type: 'cut-placed', payload: { height: separatorHeight } });

    if (!(await gate())) return false;
    await rc.emit({ type: 'split-verified', payload: {} });

    if (!(await gate())) return false;
    await rc.emit({ type: 'done', payload: {} });
    return true;
  }

  if (!(await pass())) return;

  // 자동 재생이 끝났다. 이제부터는 곱씹으며 한 걸음씩 짚는 사람의 몫이다.
  for (;;) {
    if (rc.cancelled) return;
    const input = await rc.waitForInput();
    if (input.type !== 'advance') continue;
    if (rc.cancelled) return;
    manual = true;
    await rc.emit({ type: 'rewind', payload: {} });
    if (!(await pass())) return;
  }
};
