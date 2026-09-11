/**
 * kmp — 어긋났을 때 버리는 것과 남기는 것.
 *
 * 단순 방식은 어긋나면 여태 맞힌 것을 통째로 버리고 한 칸 민다. KMP 는 패턴이
 * 제 안에 가진 겹침만큼을 남기고 그만큼만 민다. 두 방식을 **같은 글에 나란히**
 * 놓고, 패턴을 길게 밀수록 그 차이가 벌어지는 것을 본다.
 *
 * ── 셈 (1차 데이터는 글과 패턴 다섯뿐이다. 나머지는 전부 여기서 센다)
 *
 *   실패 함수  fail[i] = 앞 i+1 글자에서 "맨 앞에서 시작하는 조각" 과 "맨 뒤에서
 *              끝나는 조각" 이 같아지는 가장 긴 길이. 앞서 구한 값을 되짚어
 *              한 줄로 세운다 (조각 `prefixSuffixJump` 는 정의 그대로 세웠고,
 *              두 방법의 결과가 같다는 것은 test 가 잰다).
 *
 *   두 훑기는 **자리 단위**로 센다 — 패턴을 한 번 놓고 견주는 일이 한 걸음이다.
 *   단순은 늘 자리 0 부터 다시 견주고, KMP 는 앞 `keep` 글자를 이미 맞은 것으로
 *   두고 그 다음부터 견준다. 그 `keep` 이 곧 버리지 않은 것이다.
 *
 *   견줌은 맞은 글자 수 + (어긋났으면 1). 두 방식이 같은 자로 센다.
 *
 * ── 식별자
 * 쓰지 않는다. 어디에 무엇을 놓을지는 stage 가 셈하므로 payload 는 글자 자리(수)로만
 * 말한다.
 *
 * ── 이벤트 (표준은 `done` 뿐. 나머지는 이 facet 고유 — C2)
 *
 *   setup      { text, pattern, length }
 *              새 판을 연다. 손잡이가 고른 패턴이 실렸다.
 *
 *   table      { index, value, compares }
 *              실패 함수의 `index` 칸이 `value` 로 정해졌다. `compares` 는
 *              거기까지 표를 세우며 견준 누적 횟수.
 *
 *   naive      { spot, shift, matched, mismatch, compares, hit }
 *              단순 방식이 `shift` 자리에 패턴을 놓고 `matched` 글자를 맞혔다.
 *              `mismatch` 는 어긋난 패턴 자리이며 다 맞았으면 -1.
 *
 *   kmp        { spot, start, keep, matched, mismatch, compares, hit, border, to }
 *              KMP 가 `start` 자리에 놓고 앞 `keep` 은 건너뛴 채 `matched` 까지
 *              맞혔다. `border` 는 표가 준 겹침, `to` 는 다음에 놓을 자리다.
 *
 *   naive-end  { compares }      단순이 마지막 자리까지 갔다.
 *   kmp-end    { compares }      KMP 가 마지막 자리까지 갔다.
 *   measured   { naive, kmp, table, waste }
 *   done       { naive, kmp, waste }
 *   phase      { phase }         silent: true
 *
 * ── phase 어휘 (irs.ts 와 집합이 완전히 일치한다 — C3)
 *   'build' | 'scan' | 'shift' | 'found'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *   naive-compare-count · kmp-compare-count · wasted-compare-count · table-compare-count
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 패턴 길이의 선택지. facet.ts 의 segmented-slider 와 같아야 한다. */
export const KMP_LENGTH_CHOICES: readonly number[] = [4, 6, 8, 10, 12];

export type KmpData = {
  type: string;
  /** 패턴을 찾아 넣을 글. 되풀이가 있어야 헛수고가 벌어진다. */
  text: string;
  /** 손잡이가 고를 수 있는 패턴들. 길이로 고른다. */
  patterns: string[];
  /** 지금 고른 패턴의 길이. 손잡이가 민다. */
  patternLength: number;
  /** 한 걸음의 길이 (ms). */
  stepMs: number;
};

/** 패턴을 한 번 놓고 견준 한 자리. 두 방식이 같은 모양으로 말한다. */
export type KmpSpot = {
  /** 패턴을 놓은 글의 자리. */
  start: number;
  /** 앞 몇 글자를 이미 맞은 것으로 두고 시작했는가. 단순은 늘 0. */
  keep: number;
  /** 어디까지 맞았는가 (패턴 자리). */
  matched: number;
  /** 어긋난 패턴 자리. 다 맞았으면 -1. */
  mismatch: number;
  /** 이 자리에서 견준 횟수. */
  compares: number;
  /** 표가 준 겹침. 단순은 늘 0. */
  border: number;
  /** 다음에 놓을 자리. */
  to: number;
  /** 여기서 패턴을 통째로 찾았는가. */
  hit: boolean;
};

export type KmpScan = {
  /** 견준 횟수의 합. */
  compares: number;
  /** 패턴을 찾은 자리들. */
  hits: number[];
  /** 자리마다의 기록. */
  spots: KmpSpot[];
};

export type KmpRun = {
  pattern: string;
  /** 실패 함수. */
  fail: number[];
  /** 표를 세우며 견준 횟수. */
  tableCompares: number;
  naive: KmpScan;
  kmp: KmpScan;
  /** 단순이 더 견준 만큼. 이 화면의 주 수치다. */
  waste: number;
};

/**
 * 실패 함수를 한 줄로 세운다.
 *
 * 앞서 정한 값을 되짚어 물러나므로 자리마다 다시 처음부터 견주지 않는다.
 * `irs.ts` 의 `build_table` 이 이것과 같은 셈을 적는다.
 */
export function kmpFailure(pattern: string): { fail: number[]; compares: number } {
  const m = pattern.length;
  const fail = new Array<number>(m).fill(0);
  let compares = 0;
  let k = 0;
  for (let i = 1; i < m; i += 1) {
    while (k > 0 && pattern[i] !== pattern[k]) {
      compares += 1;
      k = fail[k - 1] ?? 0;
    }
    compares += 1;
    if (pattern[i] === pattern[k]) k += 1;
    fail[i] = k;
  }
  return { fail, compares };
}

/**
 * 실패 함수를 **정의 그대로** 셈한다 — 조각 `prefixSuffixJump` 가 보인 방법이다.
 *
 * 화면은 쓰지 않는다. 위의 한 줄짜리 셈이 정말 같은 표를 내는지 test 가 이것과
 * 견주는 용도다. 조각이 말한 것과 완제품이 셈하는 것이 어긋나면 그 자체가 거짓말이다.
 */
export function kmpFailureByDefinition(pattern: string): number[] {
  const m = pattern.length;
  const fail = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i += 1) {
    let value = 0;
    for (let border = i; border >= 1; border -= 1) {
      if (pattern.slice(0, border) === pattern.slice(i + 1 - border, i + 1)) {
        value = border;
        break;
      }
    }
    fail[i] = value;
  }
  return fail;
}

/** 단순 방식 — 자리마다 앞에서부터 다시 견주고, 어긋나면 한 칸 민다. */
export function naiveScan(text: string, pattern: string): KmpScan {
  const n = text.length;
  const m = pattern.length;
  const spots: KmpSpot[] = [];
  const hits: number[] = [];
  let compares = 0;

  for (let start = 0; start + m <= n; start += 1) {
    let k = 0;
    while (k < m && text[start + k] === pattern[k]) k += 1;
    const here = k < m ? k + 1 : k;
    compares += here;
    const hit = k === m;
    if (hit) hits.push(start);
    spots.push({
      start,
      keep: 0,
      matched: k,
      mismatch: hit ? -1 : k,
      compares: here,
      // 단순은 표를 갖지 않는다. 겹침을 빌리지 않으므로 늘 0 이고 한 칸만 민다.
      border: 0,
      to: start + 1,
      hit,
    });
  }
  return { compares, hits, spots };
}

/** KMP — 앞 `keep` 글자는 맞은 것으로 두고, 어긋나면 겹친 만큼만 민다. */
export function kmpScan(text: string, pattern: string, fail: number[]): KmpScan {
  const n = text.length;
  const m = pattern.length;
  const spots: KmpSpot[] = [];
  const hits: number[] = [];
  let compares = 0;
  let start = 0;
  let keep = 0;

  while (start + m <= n) {
    let k = keep;
    while (k < m && text[start + k] === pattern[k]) k += 1;
    const here = k - keep + (k < m ? 1 : 0);
    compares += here;
    const hit = k === m;
    if (hit) hits.push(start);

    // 몇 칸 미는가 — 맞은 만큼에서 그 안의 겹침을 뺀다. 겹침은 다시 볼 것이 없다.
    let border: number;
    let shift: number;
    if (hit) {
      border = fail[m - 1] ?? 0;
      shift = m - border;
    } else if (k === 0) {
      // 맞은 것이 없으면 빌릴 겹침도 없다.
      border = 0;
      shift = 1;
    } else {
      border = fail[k - 1] ?? 0;
      shift = k - border;
    }

    spots.push({
      start,
      keep,
      matched: k,
      mismatch: hit ? -1 : k,
      compares: here,
      border,
      to: start + shift,
      hit,
    });
    start += shift;
    keep = border;
  }
  return { compares, hits, spots };
}

/** 한 판에서 화면에 뜨는 수를 모두 셈한다. 손으로 옮긴 수는 하나도 없다. */
export function computeKmpRun(text: string, pattern: string): KmpRun {
  const { fail, compares: tableCompares } = kmpFailure(pattern);
  const naive = naiveScan(text, pattern);
  const kmp = kmpScan(text, pattern, fail);
  return { pattern, fail, tableCompares, naive, kmp, waste: naive.compares - kmp.compares };
}

/** 손잡이가 고른 길이의 패턴. 없으면 가장 짧은 것. */
export function pickPattern(data: KmpData): string {
  const found = data.patterns.find((p) => p.length === data.patternLength);
  if (found !== undefined) return found;
  return [...data.patterns].sort((a, b) => a.length - b.length)[0] ?? '';
}

/** 손잡이가 보낸 값을 데이터에 반영한다. 모르는 값이면 그대로 둔다. */
function applyInput(data: KmpData, input: ReactiveInputEvent): boolean {
  if (input.type !== 'length') return false;
  const p = input.payload as Record<string, unknown> | undefined;
  if (typeof p !== 'object' || p === null) return false;
  const raw = p.value;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) return false;
  if (!KMP_LENGTH_CHOICES.includes(value)) return false;
  if (data.patternLength === value) return false;
  data.patternLength = value;
  return true;
}

/** 한 판의 끝. 취소와 갈림을 한 boolean 에 겹치지 않는다 (C8). */
type Outcome = 'done' | 'cancelled' | 'restart';

export const kmpAlgorithm = async (ctx: FacetContext<KmpData>): Promise<void> => {
  const rc = ctx as ReactiveContext<KmpData>;

  /**
   * 메트릭을 절대값으로 맞춘다.
   *
   * `ctx.metric` 은 누적이고 메커니즘은 되돌릴 때만 비운다. 손잡이를 밀어 다시
   * 훑는 것은 되돌리기가 아니므로, 그냥 더하면 두 번째 판부터 수가 불어난다.
   * 지난번에 알린 값과의 차만 보내 화면이 늘 이번 판의 수를 보이게 한다.
   */
  const reported = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = reported.get(name) ?? 0;
    if (value === prev) return;
    ctx.metric(name, value - prev);
    reported.set(name, value);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const beat = (ratio: number): Promise<boolean> =>
    rc.sleep(Math.max(40, ctx.data.stepMs * ratio));

  /**
   * 걸음 사이에 손잡이가 움직였는지 본다.
   *
   * 판이 끝나기를 기다렸다 받으면 슬라이더를 민 뒤 몇 초 동안 옛 답이 계속
   * 그려진다 — 조작이 논증을 지는 화면에서 그 시차 자체가 거짓말이다.
   */
  const pushed = (): boolean => {
    // 이 루프에는 문이 없다 — 쌓인 입력을 비우는 동기 루프라 기다리는 자리가
    // 하나도 없고, `pollInput` 은 취소되면 곧바로 null 을 주므로 취소 상태에서
    // 첫 회전에 끝난다. 문이 질 취소가 애초에 생길 수 없는 모양이다 (C8).
    for (;;) {
      const input = rc.pollInput();
      if (input === null) return false;
      if (applyInput(ctx.data, input)) return true;
    }
  };

  /** 한 판. */
  const runOnce = async (): Promise<Outcome> => {
    const data = ctx.data;
    const pattern = pickPattern(data);
    if (pattern === '' || data.text.length < pattern.length) return 'done';
    const run = computeKmpRun(data.text, pattern);

    setMetric('naive-compare-count', 0);
    setMetric('kmp-compare-count', 0);
    setMetric('wasted-compare-count', 0);
    setMetric('table-compare-count', 0);

    await ctx.emit({
      type: 'setup',
      payload: { text: data.text, pattern, length: pattern.length },
    });
    if (!(await beat(1))) return 'cancelled';

    // ── 표를 세운다. 이 값이 아래에서 몇 칸 밀지를 정한다.
    let tableSoFar = 0;
    const perCell = kmpTableCompares(pattern);
    for (let i = 0; i < run.fail.length; i += 1) {
      if (ctx.cancelled) return 'cancelled';
      tableSoFar += perCell[i] ?? 0;
      setMetric('table-compare-count', tableSoFar);
      await phase('build');
      await ctx.emit({
        type: 'table',
        payload: { index: i, value: run.fail[i] ?? 0, compares: tableSoFar },
      });
      if (!(await beat(0.5))) return 'cancelled';
      if (pushed()) return 'restart';
    }

    // ── 두 훑기를 나란히 굴린다. 한 걸음에 각자 한 자리씩 나아가고, 먼저 끝난
    //    쪽은 거기 선 채로 남는다. KMP 가 절반쯤에서 멈춰 서고 단순이 계속
    //    가는 것 — 그 길이의 차가 이 화면의 주장이다.
    let naiveDone = false;
    let kmpDone = false;
    let naiveSoFar = 0;
    let kmpSoFar = 0;
    const steps = Math.max(run.naive.spots.length, run.kmp.spots.length);

    for (let step = 0; step < steps; step += 1) {
      if (ctx.cancelled) return 'cancelled';

      const ns = run.naive.spots[step];
      if (ns !== undefined) {
        naiveSoFar += ns.compares;
        setMetric('naive-compare-count', naiveSoFar);
        setMetric('wasted-compare-count', Math.max(0, naiveSoFar - kmpSoFar));
        await phase('scan');
        await ctx.emit({
          type: 'naive',
          payload: {
            spot: step,
            shift: ns.start,
            matched: ns.matched,
            mismatch: ns.mismatch,
            compares: naiveSoFar,
            hit: ns.hit,
          },
        });
      } else if (!naiveDone) {
        naiveDone = true;
        await ctx.emit({ type: 'naive-end', payload: { compares: naiveSoFar } });
      }

      const ks = run.kmp.spots[step];
      if (ks !== undefined) {
        kmpSoFar += ks.compares;
        setMetric('kmp-compare-count', kmpSoFar);
        setMetric('wasted-compare-count', Math.max(0, naiveSoFar - kmpSoFar));
        await phase(ks.hit ? 'found' : 'scan');
        await ctx.emit({
          type: 'kmp',
          payload: {
            spot: step,
            start: ks.start,
            keep: ks.keep,
            matched: ks.matched,
            mismatch: ks.mismatch,
            compares: kmpSoFar,
            hit: ks.hit,
            border: ks.border,
            to: ks.to,
          },
        });
        // 미는 일이 곧 이 방식의 주장이다. 겹침을 남기고 미는 그 걸음에 표식을 둔다.
        await phase('shift');
      } else if (!kmpDone) {
        kmpDone = true;
        await ctx.emit({ type: 'kmp-end', payload: { compares: kmpSoFar } });
      }

      if (!(await beat(1))) return 'cancelled';
      if (pushed()) return 'restart';
    }

    if (!naiveDone) await ctx.emit({ type: 'naive-end', payload: { compares: naiveSoFar } });
    if (!kmpDone) await ctx.emit({ type: 'kmp-end', payload: { compares: kmpSoFar } });

    setMetric('naive-compare-count', run.naive.compares);
    setMetric('kmp-compare-count', run.kmp.compares);
    setMetric('wasted-compare-count', run.waste);
    await ctx.emit({
      type: 'measured',
      payload: {
        naive: run.naive.compares,
        kmp: run.kmp.compares,
        table: run.tableCompares,
        waste: run.waste,
      },
    });
    if (!(await beat(1.4))) return 'cancelled';

    await ctx.emit({
      type: 'done',
      payload: { naive: run.naive.compares, kmp: run.kmp.compares, waste: run.waste },
    });
    return 'done';
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const outcome = await runOnce();
      if (outcome === 'cancelled') return;
      if (outcome === 'restart') continue;
      // 손잡이를 밀 때까지 기다린다. 여기서 재생·한 걸음이 꺼지고 되돌리기와
      // 위젯만 남는다 (메커니즘의 입력 대기 상태).
      const input = await rc.waitForInput();
      if (ctx.cancelled) return;
      applyInput(ctx.data, input);
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};

/**
 * 표의 칸마다 거기서 견준 횟수.
 *
 * `kmpFailure` 는 합만 돌려주는데 화면은 칸이 하나씩 채워지는 동안 수가 오르는
 * 것을 보여야 한다. 같은 셈을 칸 단위로 쪼개 둔다 — 합은 `kmpFailure` 와 같다.
 */
export function kmpTableCompares(pattern: string): number[] {
  const m = pattern.length;
  const fail = new Array<number>(m).fill(0);
  const per = new Array<number>(m).fill(0);
  let k = 0;
  for (let i = 1; i < m; i += 1) {
    let here = 0;
    while (k > 0 && pattern[i] !== pattern[k]) {
      here += 1;
      k = fail[k - 1] ?? 0;
    }
    here += 1;
    if (pattern[i] === pattern[k]) k += 1;
    fail[i] = k;
    per[i] = here;
  }
  return per;
}
