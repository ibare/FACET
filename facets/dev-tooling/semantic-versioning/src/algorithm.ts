/**
 * semantic-versioning — 버전의 세 자리는 내보내는 쪽과 받는 쪽의 약속이다.
 *
 * 한 꾸러미(`units`, 깔린 버전 1.4.2) 와 한 받는 쪽. 한 판에 내보냄 하나:
 * 바뀜의 무게(고침 · 기능 추가 · 호환 깨짐)로 올릴 자리를 고르고, 받는 쪽은
 * 범위(`^` · `~`)로 받을지 가르며, 잠금이 있으면 범위를 풀기 **전에** 잠금 줄을 읽어
 * 그 버전을 그대로 둔다. 손잡이 둘(`change` · `receiver`) — reactive.
 *
 * ── 규약
 *   - 버전은 세 수 `major.minor.patch`. 견줄 때 세 수를 차례로 수로. 세 수가 아니면 던진다.
 *   - 범위 `^M.m.p` → [M.m.p, (M+1).0.0) (M > 0) · `^0.m.p` → [0.m.p, 0.(m+1).0) (m > 0) ·
 *     `^0.0.p` → [0.0.p, 0.0.(p+1)) · `~M.m.p` → [M.m.p, M.(m+1).0). 아래 끝 포함 · 위 끝 제외.
 *     다른 기호는 던진다.
 *   - 판정: 아래 끝보다 작으면 below, 위 끝과 같거나 크면 above, 그 사이면 inside.
 *     동률 규칙 — 위 끝과 **같은** 새 버전은 벗어난다. 이 데이터에서 1.5.0(`~`) · 2.0.0(`^`) 이 실제로 걸린다.
 *   - 0 으로 떨어진 자리 수(`zeroed-digits`) = 오른 자리의 오른쪽 가운데 본디 0 이 아니었다가 0 이 된 것.
 *   - 잠금 줄(이름 · 버전 두 칸)의 이름은 꾸러미 이름과 같고, 버전은 그 받는 쪽 범위 안이어야 한다 — 아니면 던진다.
 *
 * ── 이벤트 (phase 만 silent)
 *   axis     { ticks: string[] }                       — 수직선 눈금(차례 간격). 첫 판 머리에 한 번
 *   round    { packageName, installed: string, installedTick: number, range: string,
 *              locked: boolean, lockLine: string | null, digits: number[] }  — 판 머리 (걸음 0)
 *   bump     { change: string, digit: number(0 major · 1 minor · 2 patch), from: number[], to: number[],
 *              version: string, tick: number, zeroed: number[] (0 으로 떨어진 자리 색인) }  — 걸음 1
 *   range    { range: string, lower: string, upper: string, lowerTick: number, upperTick: number } — 걸음 2 (잠금 없음)
 *   compare  { version: string, verdict: 'inside' | 'above' | 'below' }  — 걸음 3 (잠금 없음)
 *   lock     { line: string, version: string, tick: number }            — 걸음 2 (잠금)
 *   install  { accepted: boolean, from: string, to: string, fromTick: number, toTick: number,
 *              reason: 'accept' | 'reject' | 'lock' }                       — 마지막 걸음
 *   phase    { phase } silent
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *   bump-patch · bump-minor · bump-major · read-lock · keep-lock · range-ends · compare · accept · reject
 *
 * ── 계기 (판마다의 값 — 판 머리에서 0 으로)
 *   accepted       — 이번 판에 새 버전을 깔았는가 (0 · 1)
 *   zeroed-digits  — 이번 판의 새 버전에서 0 으로 떨어진 자리 수 (0 · 1 · 2)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SemanticVersioningReceiver = {
  /** 범위 글자 — `^M.m.p` 또는 `~M.m.p` */
  range: string;
  /** 잠금 파일이 있는가 */
  locked: boolean;
};

export type SemanticVersioningData = {
  type: 'semantic-versioning';
  stepMs: number;
  /** 걸음마다 무대가 옮겨 가는 시간 (1 배속) */
  motionMs: number;
  packageName: string;
  installed: string;
  /** 바뀜 식별자 — 손잡이 change 의 사다리 차례 */
  changes: string[];
  /** 받는 쪽 — 손잡이 receiver 의 사다리 차례 */
  receivers: SemanticVersioningReceiver[];
  /** 잠금 파일에 적힌 줄 — 이름 · 버전 두 칸 */
  lockLine: string;
  /** 손잡이 처음 값 */
  start: { change: number; receiver: number };
};

export type Version = [number, number, number];
export type Verdict = 'inside' | 'above' | 'below';

/** 바뀜 식별자 → 오르는 자리 (0 major · 1 minor · 2 patch) */
const BUMP_DIGIT: Record<string, number> = { breaking: 0, feature: 1, fix: 2 };

export function parseVersion(text: string): Version {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (!m) throw new Error(`semantic-versioning: 세 수 버전이 아니다 — '${text}'`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function formatVersion(v: readonly number[]): string {
  if (v.length !== 3) throw new Error(`semantic-versioning: 버전은 세 수다 — 길이 ${v.length}`);
  return `${v[0]}.${v[1]}.${v[2]}`;
}

export function compareVersion(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) throw new Error('semantic-versioning: 버전 자리가 비었다');
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** 범위 글자 → 기호 번호(0 `^` · 1 `~`) 와 세 수 */
export function parseRange(text: string): { op: number; want: Version } {
  const sign = text.charAt(0);
  if (sign === '^') return { op: 0, want: parseVersion(text.slice(1)) };
  if (sign === '~') return { op: 1, want: parseVersion(text.slice(1)) };
  throw new Error(`semantic-versioning: 모르는 범위 모양 — '${text}'`);
}

/** 범위의 위 끝 (0.x 특례 포함) */
export function upperOf(op: number, want: Version): Version {
  const [major, minor, patch] = want;
  if (op === 0) {
    if (major > 0) return [major + 1, 0, 0];
    if (minor > 0) return [0, minor + 1, 0];
    return [0, 0, patch + 1];
  }
  if (op === 1) return [major, minor + 1, 0];
  throw new Error(`semantic-versioning: 모르는 범위 기호 번호 — ${op}`);
}

export function bumpDigitOf(change: string): number {
  const d = BUMP_DIGIT[change];
  if (d === undefined) throw new Error(`semantic-versioning: 모르는 바뀜 — '${change}'`);
  return d;
}

/** 한 자리 +1, 오른쪽 자리 0. 0 으로 떨어진 자리 색인도 함께 */
export function bump(cur: Version, digit: number): { to: Version; zeroed: number[] } {
  const to: Version = [cur[0], cur[1], cur[2]];
  const zeroed: number[] = [];
  to[digit as 0 | 1 | 2] = cur[digit as 0 | 1 | 2] + 1;
  for (let i = digit + 1; i < 3; i++) {
    if (cur[i as 0 | 1 | 2] !== 0) zeroed.push(i);
    to[i as 0 | 1 | 2] = 0;
  }
  return { to, zeroed };
}

export function verdictOf(v: Version, lower: Version, upper: Version): Verdict {
  if (compareVersion(v, lower) < 0) return 'below';
  if (compareVersion(v, upper) >= 0) return 'above';
  return 'inside';
}

/** 한 판의 결과 — 검사와 화면이 같은 셈을 본다 */
export type RoundResult = {
  newVersion: Version;
  digit: number;
  zeroed: number[];
  /** 잠금이면 null (범위를 풀지 않는다) */
  ends: { lower: Version; upper: Version } | null;
  verdict: Verdict | 'locked';
  installed: Version;
  accepted: boolean;
};

function parseLockLine(line: string, packageName: string): Version {
  const cells = line.split(' ');
  if (cells.length !== 2) throw new Error(`semantic-versioning: 잠금 줄은 이름 · 버전 두 칸이다 — '${line}'`);
  if (cells[0] !== packageName) {
    throw new Error(`semantic-versioning: 잠금 줄의 이름이 꾸러미와 다르다 — '${cells[0]}'`);
  }
  return parseVersion(cells[1] ?? '');
}

export function playRound(data: SemanticVersioningData, change: number, receiver: number): RoundResult {
  const kind = data.changes[change];
  const rec = data.receivers[receiver];
  if (kind === undefined) throw new Error(`semantic-versioning: 바뀜 사다리 밖 — ${change}`);
  if (rec === undefined) throw new Error(`semantic-versioning: 받는 쪽 사다리 밖 — ${receiver}`);
  const cur = parseVersion(data.installed);
  const digit = bumpDigitOf(kind);
  const { to, zeroed } = bump(cur, digit);
  const { op, want } = parseRange(rec.range);
  if (rec.locked) {
    // 잠금을 범위보다 먼저 본다. 잠긴 버전이 범위 밖인 데이터는 다루지 않는다.
    const pinned = parseLockLine(data.lockLine, data.packageName);
    if (verdictOf(pinned, want, upperOf(op, want)) !== 'inside') {
      throw new Error(`semantic-versioning: 잠긴 버전 ${formatVersion(pinned)} 이 범위 ${rec.range} 밖이다`);
    }
    return { newVersion: to, digit, zeroed, ends: null, verdict: 'locked', installed: pinned, accepted: false };
  }
  const upper = upperOf(op, want);
  const verdict = verdictOf(to, want, upper);
  const accepted = verdict === 'inside';
  return {
    newVersion: to,
    digit,
    zeroed,
    ends: { lower: want, upper },
    verdict,
    installed: accepted ? to : cur,
    accepted,
  };
}

/** 수직선 눈금 — 깔린 버전 · 세 바뀜의 새 버전 · 모든 범위의 두 끝. 수로 견주어 차례대로, 겹침 없이 */
export function axisTicks(data: SemanticVersioningData): string[] {
  const cur = parseVersion(data.installed);
  const all: Version[] = [cur];
  for (const kind of data.changes) all.push(bump(cur, bumpDigitOf(kind)).to);
  for (const rec of data.receivers) {
    const { op, want } = parseRange(rec.range);
    all.push(want, upperOf(op, want));
  }
  all.sort(compareVersion);
  const out: string[] = [];
  for (const v of all) {
    const s = formatVersion(v);
    if (out[out.length - 1] !== s) out.push(s);
  }
  return out;
}

function tickOf(ticks: string[], v: Version): number {
  const i = ticks.indexOf(formatVersion(v));
  if (i < 0) throw new Error(`semantic-versioning: 눈금에 없는 버전 — ${formatVersion(v)}`);
  return i;
}

export async function semanticVersioningAlgorithm(
  base: FacetContext<SemanticVersioningData>,
): Promise<void> {
  const ctx = base as ReactiveContext<SemanticVersioningData>;
  const data = ctx.data;
  const pace = data.stepMs + data.motionMs;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 지금 보이는 계기 값 — 차이만 보낸다 (러너는 되감기 때만 비운다)
  const shown = new Map<string, number>([
    ['accepted', 0],
    ['zeroed-digits', 0],
  ]);
  const setMetric = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev === undefined) throw new Error(`semantic-versioning: 선언하지 않은 계기 — ${name}`);
    shown.set(name, value);
    ctx.metric(name, value - prev);
  };

  let change = data.start.change;
  let receiver = data.start.receiver;
  const ticks = axisTicks(data);
  const cur = parseVersion(data.installed);
  let axisSent = false;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const rec = data.receivers[receiver];
      const kind = data.changes[change];
      if (rec === undefined || kind === undefined) {
        throw new Error(`semantic-versioning: 손잡이 값이 사다리 밖 — change ${change} · receiver ${receiver}`);
      }
      const r = playRound(data, change, receiver);

      // 걸음 0 — 판 머리
      if (!axisSent) {
        await ctx.emit({ type: 'axis', payload: { ticks } });
        axisSent = true;
      }
      await ctx.emit({
        type: 'round',
        payload: {
          packageName: data.packageName,
          installed: data.installed,
          installedTick: tickOf(ticks, cur),
          range: rec.range,
          locked: rec.locked,
          lockLine: rec.locked ? data.lockLine : null,
          digits: [cur[0], cur[1], cur[2]],
        },
      });
      setMetric('accepted', 0);
      setMetric('zeroed-digits', 0);
      if (!(await ctx.sleep(pace))) return;

      // 걸음 1 — 오르는 자리
      if (r.digit === 0) await phase('bump-major');
      else if (r.digit === 1) await phase('bump-minor');
      else await phase('bump-patch');
      await ctx.emit({
        type: 'bump',
        payload: {
          change: kind,
          digit: r.digit,
          from: [cur[0], cur[1], cur[2]],
          to: [r.newVersion[0], r.newVersion[1], r.newVersion[2]],
          version: formatVersion(r.newVersion),
          tick: tickOf(ticks, r.newVersion),
          zeroed: r.zeroed,
        },
      });
      setMetric('zeroed-digits', r.zeroed.length);
      if (!(await ctx.sleep(pace))) return;

      if (rec.locked) {
        // 걸음 2 — 잠금 파일을 먼저 읽는다 (범위는 풀지 않는다)
        await phase('read-lock');
        await ctx.emit({
          type: 'lock',
          payload: { line: data.lockLine, version: formatVersion(r.installed), tick: tickOf(ticks, r.installed) },
        });
        if (!(await ctx.sleep(pace))) return;

        // 걸음 3 — 깔린 것 제자리
        await phase('keep-lock');
        await ctx.emit({
          type: 'install',
          payload: {
            accepted: false,
            from: data.installed,
            to: formatVersion(r.installed),
            fromTick: tickOf(ticks, cur),
            toTick: tickOf(ticks, r.installed),
            reason: 'lock',
          },
        });
        setMetric('accepted', 0);
      } else {
        const ends = r.ends;
        if (ends === null || r.verdict === 'locked') {
          throw new Error('semantic-versioning: 잠금 없는 받는 쪽인데 두 끝이 없다');
        }
        // 걸음 2 — 두 끝
        await phase('range-ends');
        await ctx.emit({
          type: 'range',
          payload: {
            range: rec.range,
            lower: formatVersion(ends.lower),
            upper: formatVersion(ends.upper),
            lowerTick: tickOf(ticks, ends.lower),
            upperTick: tickOf(ticks, ends.upper),
          },
        });
        if (!(await ctx.sleep(pace))) return;

        // 걸음 3 — 새 버전을 두 끝에 댄다
        await phase('compare');
        await ctx.emit({
          type: 'compare',
          payload: { version: formatVersion(r.newVersion), verdict: r.verdict },
        });
        if (!(await ctx.sleep(pace))) return;

        // 걸음 4 — 받음 또는 거절
        if (r.accepted) await phase('accept');
        else await phase('reject');
        await ctx.emit({
          type: 'install',
          payload: {
            accepted: r.accepted,
            from: data.installed,
            to: formatVersion(r.installed),
            fromTick: tickOf(ticks, cur),
            toTick: tickOf(ticks, r.installed),
            reason: r.accepted ? 'accept' : 'reject',
          },
        });
        setMetric('accepted', r.accepted ? 1 : 0);
      }

      // 판 사이 — 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof value !== 'number') continue;
        if (input.type === 'change') {
          if (data.changes[value] === undefined) continue;
          change = value;
          break;
        }
        if (input.type === 'receiver') {
          if (data.receivers[value] === undefined) continue;
          receiver = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
