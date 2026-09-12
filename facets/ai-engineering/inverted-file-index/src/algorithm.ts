/**
 * 역파일 색인 (IVF) — 몇 칸을 여느냐가 정확함과 빠르기를 함께 정한다.
 *
 * 점 스물넷이 네 칸에 나뉘어 있고 질의는 그 한가운데 있다. 칸을 하나 열 때마다
 * 그 칸에 든 점을 모두 재 보고, 지금까지 본 것 가운데 가까운 k 개를 답으로 든다.
 * 칸을 더 열면 빠뜨렸던 점이 답으로 돌아오고, 그만큼 본 점이 는다. 둘이 같은
 * 손잡이에 매여 함께 움직인다.
 *
 * ── 1차 데이터
 *   points     점의 정수 좌표
 *   centroids  칸마다의 대표 좌표
 *   query      질의 좌표
 *   k          찾을 개수
 *   nprobe     처음 열 칸 수 (손잡이의 기본 구간과 같아야 한다)
 *   stepMs     걸음 사이의 정지 시간
 *
 * 파생값 — 거리 · 칸 배정 · 여는 차례 · 답 · 맞힌 수 · 재현율 · 본 점 수 — 은
 * 전부 여기서 좌표로부터 셈한다. 선언에 박지 않는다.
 *
 * ── 동률 규칙
 *
 * 셋 다 정해 두지 않으면 좌표를 손대는 순간 실행마다 다른 화면이 나온다.
 *
 *   1. 어느 칸에 드는가 — 대표까지 더 가까운 칸. 같으면 칸 번호가 작은 쪽.
 *   2. 여는 차례 — 질의에서 대표까지 더 가까운 칸. 같으면 칸 번호가 작은 쪽.
 *      이 데이터에서 칸 1 과 칸 3 은 질의로부터 정확히 같은 거리다 (둘 다 가로
 *      7.3 · 세로 5.7). 규칙이 없으면 셋째로 열 칸이 실행마다 바뀐다.
 *      — 이 머리말의 칸 번호는 0 부터 센다. 화면과 글은 1 부터 세므로 같은 둘이
 *        거기서는 "칸 2 와 칸 4" 다.
 *   3. 답의 차례 — 질의까지 더 가까운 점. 같으면 점 번호가 작은 쪽.
 *      √61 자리에 네 점(3 · 10 · 15 · 18)이 몰려 있어 이 규칙이 답의 다섯째와
 *      참값의 다섯째를 정한다. 넷째 칸이 답을 하나도 바꾸지 못하는 것도 여기서
 *      나온다 — 그 칸의 √61 점은 점 번호가 가장 늦다.
 *
 * 거리는 **좌표를 십분의 일 단위 정수로 올려** 제곱합으로 견준다. 대표가 3.3 처럼
 * 한 자리 소수라서 실수로 재면 `10 - 4.3` 과 `15.7 - 10` 이 마지막 비트에서 갈리고,
 * 그 티끌이 2번 규칙의 동률을 한쪽으로 기울인다. 실제로 그렇게 기울어 셋째 칸이
 * 뒤바뀌었다.
 *
 * ── 발신 이벤트 (C2). 넷 다 걸음의 경계이므로 silent 아니다.
 *   round-begin  { nprobe, k, truth: number[], cells: number[][] }
 *                 이번 판을 세운다. cells 는 칸마다 든 점 번호.
 *   probe-order  { order: number[], nprobe }
 *                 여는 차례. order[0] 부터 연다.
 *   cell-opened  { cell, rank, scanned: number[], answer: number[] }
 *                 칸 하나를 열었다. scanned 는 지금까지 재 본 점 전부,
 *                 answer 는 그것들 가운데 가까운 k 개.
 *   round-end    { seen, total, hit, recall, answer: number[], opened: number[] }
 *                 total 은 점 전부의 수. 캡션이 "스물넷 가운데 열둘" 을 말하려면
 *                 그 분모도 데이터에서 와야 한다.
 *
 * `phase` 는 발신하지 않는다 — 코드 패널이 없다 (irs.ts, C3 all-or-none).
 *
 * ── 계기 (C5). facet.ts 의 metrics 에 선언된 이름만 쓴다.
 *   recall-percent  참값 k 개 가운데 맞힌 비율. 정수 나눗셈 반올림.
 *   scanned-count   이번 판에 거리를 재 본 점의 수.
 *
 * ── 받는 입력 (S-runtime 의 dispatch 단일 경로)
 *   nprobe { value: number }  control-bar 의 segmented-slider
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core';

export type InvertedFileIndexData = {
  type: 'inverted-file-index';
  /** 점의 좌표. 정수다. */
  points: number[][];
  /** 칸마다의 대표 좌표. 한 자리 소수까지. */
  centroids: number[][];
  query: number[];
  k: number;
  nprobe: number;
  stepMs: number;
};

/** 좌표를 십분의 일 단위 정수로. 1차 데이터의 정밀도가 한 자리 소수까지다. */
function tenths(p: number[]): number[] {
  return [Math.round(p[0] * 10), Math.round(p[1] * 10)];
}

/** 제곱 거리. 십분의 일 단위 정수끼리라 값이 정확하다. */
function dist2(a: number[], b: number[]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/** 점마다 가장 가까운 대표의 칸 번호. 동률이면 칸 번호가 작은 쪽 (규칙 1). */
function assignCells(points: number[][], centroids: number[][]): number[] {
  return points.map((p) => {
    let best = 0;
    let bestD = dist2(p, centroids[0]);
    for (let c = 1; c < centroids.length; c += 1) {
      const d = dist2(p, centroids[c]);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  });
}

/** 칸 번호 → 그 칸에 든 점 번호들. */
function membersOf(cellOf: number[], cellCount: number): number[][] {
  const out: number[][] = [];
  for (let c = 0; c < cellCount; c += 1) out.push([]);
  for (let i = 0; i < cellOf.length; i += 1) out[cellOf[i]].push(i);
  return out;
}

/** 질의에서 대표까지 가까운 차례. 동률이면 칸 번호가 작은 쪽 (규칙 2). */
function probeOrder(centroids: number[][], query: number[]): number[] {
  return centroids
    .map((c, i) => ({ i, d: dist2(c, query) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((row) => row.i);
}

/** 후보 가운데 질의에 가까운 k 개. 동률이면 점 번호가 작은 쪽 (규칙 3). */
function nearest(candidates: number[], points: number[][], query: number[], k: number): number[] {
  return candidates
    .map((i) => ({ i, d: dist2(points[i], query) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, k)
    .map((row) => row.i);
}

/**
 * 반올림 백분율. **정수 나눗셈만 쓴다.**
 *
 * 실수로 셈하면 5/5 가 101 로 뜨는 일이 실제로 있었다 (부동소수 어긋남이
 * 올림으로 새는 자리). 나눗셈을 거치지 않는 모양이 그 자리를 아예 없앤다.
 */
function percent(hit: number, k: number): number {
  return Math.floor((hit * 100 + Math.floor(k / 2)) / k);
}

/** 손잡이가 보낸 칸 수. 이 facet 이 받는 입력은 이것 하나다. */
function readProbe(input: ReactiveInputEvent, cellCount: number): number | null {
  if (input.type !== 'nprobe') return null;
  const p = input.payload as { value?: unknown } | undefined;
  if (typeof p?.value !== 'number' || !Number.isFinite(p.value)) return null;
  return Math.max(1, Math.min(cellCount, Math.floor(p.value)));
}

export const invertedFileIndexAlgorithm = async (
  ctx: FacetContext<InvertedFileIndexData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<InvertedFileIndexData>;
  const data = ctx.data;

  const points = data.points.map(tenths);
  const centroids = data.centroids.map(tenths);
  const query = tenths(data.query);
  const k = data.k;
  const cellCount = centroids.length;

  const cells = membersOf(assignCells(points, centroids), cellCount);
  const order = probeOrder(centroids, query);
  const truth = nearest(
    points.map((_, i) => i),
    points,
    query,
    k,
  );

  /**
   * 계기는 누적 채널이다 — 러너는 되감기 때만 비운다. 손잡이를 돌려 다시 도는
   * 것은 되감기가 아니므로 지금 값을 들고 **차이만** 보낸다. 델타가 0 이어도
   * 보낸다: 연 칸 3 과 4 는 재현율이 둘 다 100% 라 그 자리를 실제로 만나는데,
   * 안 보내면 그 회차에 계기 이름이 통째로 빠져 "선언한 계기가 없는 것" 과
   * 구별되지 않는다.
   */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name) ?? 0;
    shown.set(name, value);
    ctx.metric(name, value - prev);
  };

  /** 손잡이를 기다린다. 새 칸 수를 받으면 그 값, 취소면 null. */
  const nextProbe = async (): Promise<number | null> => {
    for (;;) {
      if (ctx.cancelled) return null; // 앞 — continue 로 돌아와도 여기를 지난다
      const input = await rc.waitForInput();
      if (ctx.cancelled) return null; // 뒤 — throw 규약에 기대지 않는다
      const value = readProbe(input, cellCount);
      if (value === null) continue;
      return value;
    }
  };

  let nprobe = Math.max(1, Math.min(cellCount, Math.floor(data.nprobe)));

  try {
    for (;;) {
      if (ctx.cancelled) return;

      await ctx.emit({
        type: 'round-begin',
        payload: { nprobe, k, truth: [...truth], cells: cells.map((m) => [...m]) },
      });
      if (!(await rc.sleep(data.stepMs))) return;

      await ctx.emit({ type: 'probe-order', payload: { order: [...order], nprobe } });
      if (!(await rc.sleep(data.stepMs))) return;

      // 본 점과 답. **세는 배열과 그리는 배열이 같은 것이어야** 화면이 말하는
      // 수와 화면에 선 것이 어긋나지 않는다 — 계기도 stage 도 이 둘만 본다.
      const scanned: number[] = [];
      let answer: number[] = [];
      const opened: number[] = [];

      for (let rank = 0; rank < nprobe; rank += 1) {
        if (ctx.cancelled) return;
        const cell = order[rank];
        opened.push(cell);
        scanned.push(...cells[cell]);
        answer = nearest(scanned, points, query, k);
        await ctx.emit({
          type: 'cell-opened',
          payload: { cell, rank, scanned: [...scanned], answer: [...answer] },
        });
        if (!(await rc.sleep(data.stepMs))) return;
      }

      // 참값이 후보에 들었다면 그 점은 반드시 답에도 든다 — 전수에서 자기보다
      // 가까운 점이 넷을 넘지 않으므로 부분집합에서도 k 위 안이다. 그래서
      // 화면에서 고리를 두른 채 번호를 단 점의 수가 곧 맞힌 수다.
      const hit = answer.filter((i) => truth.includes(i)).length;
      gauge('recall-percent', percent(hit, k));
      gauge('scanned-count', scanned.length);
      await ctx.emit({
        type: 'round-end',
        payload: {
          seen: scanned.length,
          total: points.length,
          hit,
          recall: percent(hit, k),
          answer: [...answer],
          opened: [...opened],
        },
      });

      const next = await nextProbe();
      if (next === null) return;
      nprobe = next;
    }
  } catch (err) {
    // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
    // 올려 러너가 드러내게 둔다 (C8 정본).
    if (!ctx.cancelled) throw err;
    return;
  }
};
