/**
 * DBSCAN — 두 손잡이는 각각 무엇을 만지는가.
 *
 * eps 는 **잇는다**. 올리면 떨어져 있던 무리가 서로 닿아 하나가 되고 수가 준다.
 * minPts 는 **무너뜨린다**. 올리면 작은 덩이부터 속을 잃어 통째로 잡음이 된다.
 * 무리 수를 같게 만드는 조합이 여럿인데 그 속내가 다르다 — 그것을 보이려고
 * 두 손잡이를 독자에게 준다.
 *
 * ── 진행 모델
 *
 * reactive. 마운트 직후 기본 손잡이(eps 1.3 · minPts 3)로 한 호흡 자동 시연하고
 * `waitForInput` 으로 들어간다. 손잡이가 움직이면 **처음부터 재생하지 않고**
 * 그 값으로 다시 셈한 결과만 갈아 끼운다 — 처음으로 돌아가면 견주기가 안 된다.
 * 앞서 본 (무리 수 / 잡음 수) 는 화면의 대조표에 그대로 쌓인다.
 *
 * 재생 · 멈춤 · 한 걸음은 메커니즘이 진다. 알고리즘은 `ctx.sleep` 으로 걸음을
 * 잇고 위젯 입력만 본다.
 *
 * ── 식별자 (C1)
 *
 *   `point:<i>`   점 하나. i 는 `data.points` 의 자리.
 *
 * `target` 은 선택 채널이고 **정규 경로는 `payload.index`** 다 (C2 의
 * `layer-discovered` 가 같은 규약을 쓴다). projector 는 payload 를 읽고,
 * target 은 식별자 문법을 아는 바깥 도구를 위해 함께 싣는다.
 *
 * ── 이벤트 어휘 (C2). 아래가 전부이고 projector 가 전부를 다룬다.
 *
 *   phase             { phase: string }                       silent. C3 동기.
 *   params-set        { eps, minPts, epsIndex, minPtsIndex,
 *                       note: 'start' | 'eps-up' | 'eps-down'
 *                             | 'min-pts-up' | 'min-pts-down' }
 *                     손잡이가 놓인 자리. note 는 문안이 아니라 갈래 이름이고
 *                     문장은 projector 가 고른다 (C10).
 *   probe             { index, count, core, minPts }           target point:<i>
 *                     그 점 둘레 eps 안을 세어 본 결과. 자기 자신을 넣어 센다.
 *   noise-marked      { index }                                target point:<i>
 *   cluster-opened    { index, cluster }                       target point:<i>
 *   spread-to         { index, cluster, from }                 target point:<i>
 *   border-reclaimed  { index, cluster, from }                 target point:<i>
 *                     잡음이라 적어 둔 점이 가장자리가 되어 무리에 든다.
 *   stack-changed     { cells: number[], top: number }
 *                     스택은 배열과 꼭대기 색인이다. top 위의 칸은 지워지지 않고
 *                     남으므로 그대로 보낸다.
 *   settled           { eps, minPts, epsIndex, minPtsIndex, labels: number[],
 *                       core: boolean[], links: [number, number][],
 *                       clusters, noise }
 *                     한 손잡이 조합의 최종 상태. 자동 시연이든 즉시 셈이든
 *                     끝은 언제나 이것 하나다.
 *
 * ── phase 어휘 (C3). `irs.ts` 와 글자까지 같다.
 *
 *   'begin' | 'pick-seed' | 'count-neighbors' | 'mark-noise' | 'open-cluster' |
 *   'push' | 'pop' | 'core-check' | 'spread' | 'reclaim-border' | 'done'
 *
 * ── 메트릭 (C5)
 *
 *   cluster-count   지금 무리 수      (누적이 아니라 현재값. 델타로 맞춘다)
 *   noise-count     지금 잡음 수      (같음)
 *   distance-count  거리를 잰 횟수    (누적. 손잡이를 옮길수록 늘어난다)
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type DbscanPoint = { x: number; y: number };

export type DbscanData = {
  type: string;
  /** 평면 위의 점. 화면 좌표가 아니라 자료 좌표다 — 자리는 stage 가 셈한다. */
  points: DbscanPoint[];
  /** eps 손잡이가 고를 수 있는 값. 오름차순. */
  epsOptions: number[];
  /** minPts 손잡이가 고를 수 있는 값. 오름차순. */
  minPtsOptions: number[];
  initialEpsIndex: number;
  initialMinPtsIndex: number;
  /** 자동 시연 한 걸음의 길이 (ms). 번짐 한 칸은 이 절반으로 간다. */
  stepMs: number;
};

/** 두 손잡이가 보내는 입력. `type` 은 control-bar 의 action 어휘 그대로다. */
export type DbscanInputEvent = ReactiveInputEvent;

/** 한 번의 셈이 어떻게 끝났는가. */
type SweepEnd = 'settled' | 'cancelled' | 'interrupted';

const NOISE = -1;
const UNSEEN = 0;

function countNoise(label: number[]): number {
  let out = 0;
  for (const v of label) if (v === NOISE) out += 1;
  return out;
}

/**
 * 위젯이 보낸 payload 에서 구간 번호를 읽는다.
 *
 * segmented-slider 는 `{ value, segmentIndex, ...inputState }` 를 보낸다.
 * `segmentIndex` 가 정본이고, 없으면 값으로 자리를 찾는다.
 */
function readSegment(event: ReactiveInputEvent, options: number[]): number | null {
  const p = event.payload as { segmentIndex?: unknown; value?: unknown } | undefined;
  if (typeof p?.segmentIndex === 'number' && p.segmentIndex >= 0 && p.segmentIndex < options.length) {
    return p.segmentIndex;
  }
  if (typeof p?.value === 'number') {
    const at = options.indexOf(p.value);
    if (at >= 0) return at;
  }
  return null;
}

export async function dbscan(ctx: FacetContext<DbscanData>): Promise<void> {
  const rctx = ctx as ReactiveContext<DbscanData>;
  const data = ctx.data;
  const pts = Array.isArray(data.points) ? data.points : [];
  const epsOptions = Array.isArray(data.epsOptions) && data.epsOptions.length > 0
    ? data.epsOptions
    : [1];
  const minPtsOptions = Array.isArray(data.minPtsOptions) && data.minPtsOptions.length > 0
    ? data.minPtsOptions
    : [3];
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : 240;

  const clampIndex = (raw: unknown, len: number): number =>
    typeof raw === 'number' && raw >= 0 && raw < len ? Math.floor(raw) : 0;

  let epsIndex = clampIndex(data.initialEpsIndex, epsOptions.length);
  let minPtsIndex = clampIndex(data.initialMinPtsIndex, minPtsOptions.length);

  /** 현재값 메트릭은 델타로만 갱신되므로 마지막으로 보인 값을 들고 있는다. */
  const shown: Record<string, number> = { 'cluster-count': 0, 'noise-count': 0 };
  const setMetric = (name: 'cluster-count' | 'noise-count', value: number): void => {
    if (shown[name] === value) return;
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 자동 시연 도중 들어온 손잡이 입력. 있으면 지금 셈을 접고 새 값으로 다시 센다. */
  let pending: ReactiveInputEvent | null = null;

  /** 걸음 사이의 쉼. 취소되면 false. 그 사이 들어온 입력은 pending 에 담는다. */
  async function beat(ms: number): Promise<boolean> {
    if (!(await rctx.sleep(ms))) return false;
    const queued = rctx.pollInput();
    if (queued) pending = queued;
    return true;
  }

  async function emitStack(cells: number[], top: number): Promise<void> {
    await ctx.emit({ type: 'stack-changed', payload: { cells: [...cells], top } });
  }

  /**
   * 한 손잡이 조합으로 처음부터 끝까지 센다. `irs.ts` 의 진입점과 같은 순서다.
   *
   * `animate` 가 거짓이면 걸음 이벤트와 쉼을 내지 않는다 — 손잡이를 옮겼을 때
   * 처음부터 다시 보여 주는 대신 그 값의 결과만 갈아 끼우기 위해서다.
   */
  async function sweep(ei: number, mi: number, animate: boolean): Promise<SweepEnd> {
    const eps = epsOptions[ei];
    const minPts = minPtsOptions[mi];
    const eps2 = eps * eps;
    const n = pts.length;
    const label = new Array<number>(n).fill(UNSEEN);
    const core = new Array<boolean>(n).fill(false);
    const stack = new Array<number>(n).fill(0);
    const links: Array<[number, number]> = [];
    let top = 0;
    let clusters = 0;

    await phase('begin');
    setMetric('cluster-count', 0);
    setMetric('noise-count', 0);
    if (animate) await emitStack(stack, top);

    for (let i = 0; i < n; i += 1) {
      if (ctx.cancelled) return 'cancelled';
      await phase('pick-seed');
      if (label[i] !== UNSEEN) continue;

      await phase('count-neighbors');
      let count = 0;
      for (let j = 0; j < n; j += 1) {
        // 이 고리는 한 걸음 안에서 발신 없이 세기만 하므로 문(gate)을 둘 수 없다.
        // 그래서 스스로 검사한다 (C8).
        if (ctx.cancelled) return 'cancelled';
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        if (dx * dx + dy * dy <= eps2) count += 1;
      }
      ctx.metric('distance-count', n);
      core[i] = count >= minPts;
      if (animate) {
        await ctx.emit({
          type: 'probe',
          target: `point:${i}`,
          payload: { index: i, count, core: core[i], minPts },
        });
        if (!(await beat(stepMs))) return 'cancelled';
        if (pending) return 'interrupted';
      }

      if (count < minPts) {
        await phase('mark-noise');
        label[i] = NOISE;
        setMetric('noise-count', countNoise(label));
        if (animate) {
          await ctx.emit({ type: 'noise-marked', target: `point:${i}`, payload: { index: i } });
          if (!(await beat(stepMs))) return 'cancelled';
          if (pending) return 'interrupted';
        }
        continue;
      }

      await phase('open-cluster');
      clusters += 1;
      label[i] = clusters;
      setMetric('cluster-count', clusters);
      top = 0;
      if (animate) {
        await ctx.emit({
          type: 'cluster-opened',
          target: `point:${i}`,
          payload: { index: i, cluster: clusters },
        });
      }

      await phase('push');
      stack[top] = i;
      top += 1;
      if (animate) {
        await emitStack(stack, top);
        if (!(await beat(stepMs))) return 'cancelled';
        if (pending) return 'interrupted';
      }

      while (top > 0) {
        if (ctx.cancelled) return 'cancelled';
        await phase('pop');
        top -= 1;
        const q = stack[top];
        if (animate) await emitStack(stack, top);

        await phase('count-neighbors');
        let reach = 0;
        for (let j = 0; j < n; j += 1) {
          // 위와 같다 — 세기만 하는 고리라 문이 없고 스스로 검사한다 (C8).
          if (ctx.cancelled) return 'cancelled';
          const dx = pts[q].x - pts[j].x;
          const dy = pts[q].y - pts[j].y;
          if (dx * dx + dy * dy <= eps2) reach += 1;
        }
        ctx.metric('distance-count', n);
        core[q] = reach >= minPts;
        if (animate) {
          await ctx.emit({
            type: 'probe',
            target: `point:${q}`,
            payload: { index: q, count: reach, core: core[q], minPts },
          });
          if (!(await beat(stepMs))) return 'cancelled';
          if (pending) return 'interrupted';
        }

        await phase('core-check');
        if (reach < minPts) continue;

        await phase('spread');
        // 펼치는 고리도 거리를 다시 잰다 — IR 의 세 번째 j 고리다.
        ctx.metric('distance-count', n);
        for (let j = 0; j < n; j += 1) {
          if (ctx.cancelled) return 'cancelled';
          const dx = pts[q].x - pts[j].x;
          const dy = pts[q].y - pts[j].y;
          if (dx * dx + dy * dy > eps2) continue;

          if (label[j] === NOISE) {
            await phase('reclaim-border');
            label[j] = clusters;
            links.push([q, j]);
            setMetric('noise-count', countNoise(label));
            if (animate) {
              await ctx.emit({
                type: 'border-reclaimed',
                target: `point:${j}`,
                payload: { index: j, cluster: clusters, from: q },
              });
              if (!(await beat(stepMs / 2))) return 'cancelled';
              if (pending) return 'interrupted';
            }
          } else if (label[j] === UNSEEN) {
            await phase('spread');
            label[j] = clusters;
            links.push([q, j]);
            await phase('push');
            stack[top] = j;
            top += 1;
            if (animate) {
              await ctx.emit({
                type: 'spread-to',
                target: `point:${j}`,
                payload: { index: j, cluster: clusters, from: q },
              });
              await emitStack(stack, top);
              if (!(await beat(stepMs / 2))) return 'cancelled';
              if (pending) return 'interrupted';
            }
          }
        }
      }
    }

    await phase('done');
    const noise = countNoise(label);
    setMetric('cluster-count', clusters);
    setMetric('noise-count', noise);
    await ctx.emit({
      type: 'settled',
      payload: {
        eps,
        minPts,
        epsIndex: ei,
        minPtsIndex: mi,
        labels: [...label],
        core: [...core],
        links: [...links],
        clusters,
        noise,
      },
    });
    return 'settled';
  }

  async function emitParams(ei: number, mi: number, note: string): Promise<void> {
    await ctx.emit({
      type: 'params-set',
      payload: {
        eps: epsOptions[ei],
        minPts: minPtsOptions[mi],
        epsIndex: ei,
        minPtsIndex: mi,
        note,
      },
    });
  }

  try {
    await emitParams(epsIndex, minPtsIndex, 'start');
    let animate = true;

    for (;;) {
      if (ctx.cancelled) return;
      const end = await sweep(epsIndex, minPtsIndex, animate);
      if (end === 'cancelled') return;

      // 손잡이가 실제로 움직일 때까지 기다린다. 위젯 두 개의 액션 이름만
      // 처리하고 나머지 (재생 셋은 메커니즘이 가로챈다) 는 흘린다.
      let note = '';
      while (note === '') {
        // `waitForInput` 은 취소 때 throw 하지만 그 규약에 기대지 않는다 (C8).
        if (ctx.cancelled) return;
        const event = pending ?? (await rctx.waitForInput());
        pending = null;
        if (ctx.cancelled) return;
        if (event.type === 'eps') {
          const at = readSegment(event, epsOptions);
          if (at !== null && at !== epsIndex) {
            note = at > epsIndex ? 'eps-up' : 'eps-down';
            epsIndex = at;
          }
        } else if (event.type === 'min-pts') {
          const at = readSegment(event, minPtsOptions);
          if (at !== null && at !== minPtsIndex) {
            note = at > minPtsIndex ? 'min-pts-up' : 'min-pts-down';
            minPtsIndex = at;
          }
        }
      }

      await emitParams(epsIndex, minPtsIndex, note);
      animate = false;
    }
  } catch (err) {
    // 취소는 `waitForInput` 이 reject 로 알린다. 그것만 삼키고 나머지는 올린다 —
    // 안 잡고 러너가 삼키게 두면 진짜 오류까지 함께 조용히 사라진다 (C8).
    if (!ctx.cancelled) throw err;
  }
}
