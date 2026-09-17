/**
 * impurityDrops — 불순도 감소. "잘 갈랐다" 를 무엇으로 재는가.
 *
 * 섞임을 수 하나로 재고(지니), 가를 때마다 그 수가 떨어지는 것을 보인다.
 * 요점은 섞임이 **개수가 아니라 비율**이라는 것이다. 지니는 이렇게 고쳐 쓸 수
 * 있고 —
 *
 *   gini = 1 − p(A)² − p(B)² = 0.5 − 2·(p(A) − 0.5)²
 *
 * 그래서 통에 담긴 것이 열둘이든 백스물이든, 색 경계가 한가운데에서 얼마나
 * 벗어났는지만으로 값이 정해진다. 통이 커지면 달라지는 것은 섞임이 아니라
 * **층 전체를 셈할 때의 몫**이다 — 그래서 층의 섞임은 통 크기로 가중한 평균이다.
 *
 * ── 여기서 세지 않는 것
 *
 * 섞임도, 층의 섞임도, 내려간 폭도 여기서 세지 않는다. 그 수들은 화면의 막대와
 * **나란히** 뜨므로, 여기서 한 번 세고 그림이 또 한 번 세면 같은 물음에 답이 둘이
 * 된다. 발신이 싣는 것은 **갈랐다는 판정**(어느 통을 어디서 갈랐고 그 결과 어느
 * 이름표가 몇씩 담겼나)뿐이고, 그 판정에서 곧바로 나오는 수는 장면이 센다
 * (`scene.ts`). 세는 자리를 하나로 묶으려 이름표 세기(`tallyOf`)만 내준다 —
 * 프로토콜 4 절의 B 갈래다.
 *
 * ── 이벤트 (전부 facet 고유)
 *
 *   'sample-shown'   {}
 *       뿌리 통 하나가 섞임 자의 꼭대기에 놓인다. 그 통은 바탕 자료 전부이므로
 *       장면이 스스로 만든다 — 실어 보낼 것이 없다.
 *
 *   'cut-drawn'      { cuts: CutWire[] }
 *       그 층의 가름선을 산점도에 긋는다. 한 층에 여럿일 수 있다 (통마다 제 질문).
 *       가름선을 가둘 칸은 싣지 않는다 — 그 통이 장면에 이미 서 있다.
 *
 *   'buckets-split'  { buckets: BucketWire[] }
 *       통이 갈라져 저마다 제 섞임 높이로 내려간다. buckets 는 그 층의 잎 전부이며
 *       왼쪽→오른쪽 순서다.
 *
 *   'level-measured' {}
 *       층 전체의 섞임을 잰다. 값도 내려간 폭도 장면이 제 막대에서 센다.
 *
 *   'settled'        {}
 *       더 가를 것이 없다. 통마다 한 가지 이름표만 남았는지는 장면이 셈으로 안다.
 *
 *   'rewind'         {}
 *       처음으로 되감는다. 자동 재생이 끝난 뒤 처음 누르는 `advance` 가 이것을
 *       내보내고, 곧이어 첫 걸음까지 간다 (S-piece).
 *
 *   'done'           {} — silent
 *       발신이 끝났다는 표시. 화면은 'settled' 에서 할 말을 마쳤으므로 문을 지나지
 *       않고, 띠에 0ms 눈금을 세우지 않도록 앞 걸음에 접는다 (S-runtime).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 이름표 붙은 점 하나. */
export type ImpurityPoint = { x: number; y: number; label: string };

/**
 * 가름선 선언. `path` 가 가리키는 통을 `axis` 의 `at` 에서 가른다.
 * path 는 뿌리에서의 갈림길이며 빈 문자열이 뿌리다.
 */
export type ImpurityCut = { path: string; axis: 'x' | 'y'; at: number };

export type ImpurityDropsData = {
  type: string;
  points: ImpurityPoint[];
  classes: string[];
  cuts: ImpurityCut[];
  stepMs: number;
};

/**
 * 통이 차지한 평면의 칸. `null` 은 열린 쪽 — 그림이 제 가장자리까지 늘린다.
 * 화면 좌표가 아니라 데이터 좌표다 (좌표는 stage 가 셈한다, S-piece).
 */
export type ImpurityBox = {
  xLo: number | null;
  xHi: number | null;
  yLo: number | null;
  yHi: number | null;
};

/** 뿌리 통의 칸 — 네 쪽이 다 열려 있다. 장면도 이것을 쓴다 (한 자리에서만 정한다). */
export const IMPURITY_ROOT_BOX: ImpurityBox = { xLo: null, xHi: null, yLo: null, yHi: null };

export type BucketWire = {
  id: string;
  box: ImpurityBox;
  /** classes 순서대로의 개수. 개수·섞임·순수 여부가 전부 여기서 나온다. */
  counts: number[];
};

export type CutWire = {
  bucketId: string;
  axis: 'x' | 'y';
  at: number;
};

type Leaf = { path: string; box: ImpurityBox; points: ImpurityPoint[] };

function idOf(path: string): string {
  return path === '' ? 'root' : `root/${path.split('').join('/')}`;
}

/**
 * 이름표별 개수. `classes` 에 없는 이름표는 세지 않는다.
 *
 * 장면도 이 함수를 부른다 — 뿌리 통은 바탕 자료 전부라 발신을 기다릴 것이 없고,
 * 그렇다고 세는 규칙이 두 벌로 갈리면 안 된다 (프로토콜 4 절 B 갈래).
 */
export function tallyOf(points: readonly ImpurityPoint[], classes: readonly string[]): number[] {
  const counts = classes.map(() => 0);
  for (const p of points) {
    const k = classes.indexOf(p.label);
    if (k >= 0) counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

function wireOf(leaf: Leaf, classes: string[]): BucketWire {
  return { id: idOf(leaf.path), box: leaf.box, counts: tallyOf(leaf.points, classes) };
}

function splitLeaf(leaf: Leaf, cut: ImpurityCut): [Leaf, Leaf] {
  const lo: ImpurityPoint[] = [];
  const hi: ImpurityPoint[] = [];
  for (const p of leaf.points) {
    const v = cut.axis === 'x' ? p.x : p.y;
    if (v < cut.at) lo.push(p);
    else hi.push(p);
  }
  const boxLo: ImpurityBox = { ...leaf.box };
  const boxHi: ImpurityBox = { ...leaf.box };
  if (cut.axis === 'x') {
    boxLo.xHi = cut.at;
    boxHi.xLo = cut.at;
  } else {
    boxLo.yHi = cut.at;
    boxHi.yLo = cut.at;
  }
  return [
    { path: `${leaf.path}L`, box: boxLo, points: lo },
    { path: `${leaf.path}H`, box: boxHi, points: hi },
  ];
}

export const impurityDropsAlgorithm = async (
  ctx: FacetContext<ImpurityDropsData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<ImpurityDropsData>;
  const data = rc.data;
  const points = Array.isArray(data.points) ? data.points : [];
  const classes = Array.isArray(data.classes) ? data.classes : [];
  const cuts = Array.isArray(data.cuts) ? data.cuts : [];
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : 800;

  /** 자동 재생이 끝나면 켜진다 — 그 뒤로는 걸음마다 `advance` 를 기다린다. */
  let manual = false;
  /** 되감기 직후의 첫 문 하나만 그냥 통과시킨다 (S-piece). */
  let freeGate = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  async function gate(): Promise<boolean> {
    if (rc.cancelled) return false;
    if (!manual) return rc.sleep(stepMs);
    if (freeGate) {
      freeGate = false;
      return true;
    }
    for (;;) {
      if (rc.cancelled) return false;
      const input = await rc.waitForInput();
      if (input.type !== 'advance') continue;
      return !rc.cancelled;
    }
  }

  /** 한 바퀴 굴린다. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  async function run(): Promise<boolean> {
    let leaves: Leaf[] = [
      { path: '', box: { ...IMPURITY_ROOT_BOX }, points: [...points] },
    ];

    if (!(await gate())) return false;
    await rc.emit({ type: 'sample-shown' });

    // 층은 선언된 가름선이 마르면 끝난다 — 걸음표를 손으로 적지 않는다.
    for (;;) {
      const layerCuts: CutWire[] = [];
      const next: Leaf[] = [];
      for (const leaf of leaves) {
        const cut = cuts.find((c) => c.path === leaf.path);
        if (cut === undefined) {
          next.push(leaf);
          continue;
        }
        layerCuts.push({ bucketId: idOf(leaf.path), axis: cut.axis, at: cut.at });
        const [lo, hi] = splitLeaf(leaf, cut);
        next.push(lo, hi);
      }
      if (layerCuts.length === 0) break;

      if (!(await gate())) return false;
      await rc.emit({ type: 'cut-drawn', payload: { cuts: layerCuts } });

      const wires = next.map((l) => wireOf(l, classes));

      if (!(await gate())) return false;
      await rc.emit({ type: 'buckets-split', payload: { buckets: wires } });

      if (!(await gate())) return false;
      await rc.emit({ type: 'level-measured' });

      leaves = next;
    }

    if (!(await gate())) return false;
    await rc.emit({ type: 'settled' });
    await rc.emit({ type: 'done', silent: true });
    return true;
  }

  if (!(await run())) return;

  // 자동 재생이 끝났다. 이제부터는 한 걸음씩 짚어 볼 수 있다 —
  // 처음 누르는 `advance` 는 되감고 첫 걸음까지 간다 (S-piece).
  manual = true;
  for (;;) {
    if (rc.cancelled) return;
    const input = await rc.waitForInput();
    if (rc.cancelled) return;
    if (input.type !== 'advance') continue;
    await rc.emit({ type: 'rewind' });
    freeGate = true;
    if (!(await run())) return;
  }
};
