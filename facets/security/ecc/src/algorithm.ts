/**
 * ecc — 같은 비밀 k 로 가는 셈과 되찾는 셈.
 *
 * 비밀 k 로 G 를 k 번 더한 kG 를 두 배-더하기(높은 비트부터)로 만들고, 공개된 kG 만 보고
 * G 부터 하나씩 더해 k 를 되찾는다. 두 길의 군 연산 수를 센다. 곡선(y² = x³ + 2x + 2 mod 17)과
 * 곱셈군(g 5 mod 23)이 같은 셈을 같은 모양으로 한다 — 곡선의 두 배는 곱셈의 제곱, 더하기 G 는 g 를 곱하기다.
 *
 * ── 이벤트 (위에서 아래로 한 판)
 *   init    (silent)  { group: 'curve'|'mul', groupIndex, p, a, b, g, identity, order, k, bits: number[],
 *                       peer, barMax, marks: number[],
 *                       slots: { m, code, x, y, v, identity, alias }[] }
 *                     판 머리. 점(원소) 목록 · 차수 · 부호 규약(곡선 x·p + y, O = p·p / 곱셈은 값 그대로)을 싣는다.
 *                     slots 는 m = 1..barMax + 5 (두 군 가운데 큰 차수까지) 의 mG — m 이 차수를 넘으면 alias.
 *                     곡선 원소는 x · y, 곱셈 원소는 v 가 뜻을 가진다(나머지는 −1).
 *                     marks 는 판의 눈금(곡선 0..p−1 · 곱셈 1..p−1).
 *   double            { m, fromM, code, bitIndex, forward }   두 배(제곱) 한 번. forward 는 지금까지의 가는 셈
 *   add               { m, fromM, code, bitIndex, forward }   더하기 G(곱하기 g) 한 번
 *   recover           { path: number[], added, recovered, code }  G 부터 하나씩 더해 kG 를 만남.
 *                     path 는 G, 2G, …, kG 의 부호 (길이 k). added = k − 1 (되찾는 셈)
 *   shared            { peer, bCode, aCode, kCode, forward, backward }  B = peer·G 가 건너와 k·B = peer·A = K (끝)
 *   phase   (silent)  { phase }
 *
 * ── phase 어휘 (irs.ts 와 같다): double · add · recover · shared
 *    걸음 이벤트의 **앞에** 보낸다. 걸음 0 에는 phase 가 없다 (projector 가 판 머리에서 패널을 끈다).
 *
 * ── 계기: forward-ops (가는 셈) · backward-ops (되찾는 셈)
 *    누적 채널이라 지금 값을 쥐고 차이만 보낸다. 판 머리에서 0 으로 되돌린다. 처음 한 번은 0 이어도 보낸다.
 *
 * ── 셈 규약
 *   군 연산 하나 = 곡선의 점 덧셈(또는 두 배) 한 번 · 곱셈군의 곱 한 번.
 *   가는 셈 = 두 배-더하기의 군 연산 수 — 길을 밟으며 센다(공식을 쓰지 않는다).
 *   되찾는 셈 = G 부터 G 를 더한 수 = k − 1. 되찾은 k(= 더한 수 + 1)가 손잡이 값과 다르면 던진다.
 *   O 는 이 판의 셈에서 나오지 않는다 — 나오면 던진다. 동률 규칙은 없다(견주는 값이 없다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EccMulGroup = { id: 'mul'; p: number; g: number };
export type EccCurveGroup = { id: 'curve'; p: number; a: number; b: number; G: [number, number] };
export type EccGroup = EccMulGroup | EccCurveGroup;

export type EccData = {
  type: 'ecc';
  stepMs: number;
  groups: EccGroup[];
  groupLadder: number[];
  group: number;
  secretLadder: number[];
  secret: number;
  peerSecret: number;
};

/** 두 배-더하기 길의 한 걸음. */
export type EccLadderStep = { op: 'double' | 'add'; m: number; fromM: number; code: number; bitIndex: number };

/** 군 하나를 IR 과 같은 인자 꼴로 편 것. kind 0 곱셈 · 1 곡선. */
export type EccGroupArgs = { kind: number; g: number; p: number; a: number };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function intList(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`ecc: ${what} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (!isInt(x)) throw new Error(`ecc: ${what}[${i}] 가 정수가 아니다`);
    return x;
  });
}

function narrowGroup(v: unknown, i: number): EccGroup {
  if (typeof v !== 'object' || v === null) throw new Error(`ecc: groups[${i}] 가 객체가 아니다`);
  const o = v as Record<string, unknown>;
  if (!isInt(o.p) || o.p < 3) throw new Error(`ecc: groups[${i}].p 가 없다`);
  if (o.id === 'mul') {
    if (!isInt(o.g)) throw new Error(`ecc: groups[${i}].g 가 없다`);
    return { id: 'mul', p: o.p, g: o.g };
  }
  if (o.id === 'curve') {
    if (!isInt(o.a) || !isInt(o.b)) throw new Error(`ecc: groups[${i}] 의 a · b 가 없다`);
    const G = intList(o.G, `groups[${i}].G`);
    if (G.length !== 2) throw new Error(`ecc: groups[${i}].G 는 (x, y) 두 수다`);
    return { id: 'curve', p: o.p, a: o.a, b: o.b, G: [G[0]!, G[1]!] };
  }
  throw new Error(`ecc: 모르는 군 ${String(o.id)}`);
}

/** ctx.data 를 믿지 않고 좁힌다. */
export function narrowEccData(raw: unknown): EccData {
  if (typeof raw !== 'object' || raw === null) throw new Error('ecc: data 가 객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'ecc') throw new Error('ecc: type 이 ecc 가 아니다');
  if (!isInt(o.stepMs) || o.stepMs <= 0) throw new Error('ecc: stepMs 가 없다');
  if (!Array.isArray(o.groups)) throw new Error('ecc: groups 가 없다');
  const groups = o.groups.map((g, i) => narrowGroup(g, i));
  const groupLadder = intList(o.groupLadder, 'groupLadder');
  const secretLadder = intList(o.secretLadder, 'secretLadder');
  if (!isInt(o.group) || !groupLadder.includes(o.group)) throw new Error('ecc: group 이 사다리 밖이다');
  if (!isInt(o.secret) || !secretLadder.includes(o.secret)) throw new Error('ecc: secret 이 사다리 밖이다');
  if (!isInt(o.peerSecret) || o.peerSecret < 1) throw new Error('ecc: peerSecret 이 없다');
  for (const gi of groupLadder) if (groups[gi] === undefined) throw new Error(`ecc: 사다리의 군 ${gi} 가 groups 에 없다`);
  for (const k of secretLadder) if (k < 1) throw new Error('ecc: 비밀은 1 이상이다');
  return {
    type: 'ecc',
    stepMs: o.stepMs,
    groups,
    groupLadder,
    group: o.group,
    secretLadder,
    secret: o.secret,
    peerSecret: o.peerSecret,
  };
}

// ── 군 연산 (IR 의 groupOp · modPow 와 같은 식)

export function modPow(b: number, e: number, m: number): number {
  let result = 1;
  let bb = b % m;
  let ee = e;
  while (ee > 0) {
    if (ee % 2 === 1) result = (result * bb) % m;
    bb = (bb * bb) % m;
    ee = Math.floor(ee / 2);
  }
  return result;
}

/** 무한원점 O 의 부호. */
export const identityOf = (args: EccGroupArgs): number => (args.kind === 1 ? args.p * args.p : 1);

/**
 * 군 연산 한 번. 곡선에서 O 가 나오면 O 의 부호(p·p)를 돌려준다 — 부르는 쪽이 판정한다.
 * 모르는 군 · O 입력은 던진다 (IR 은 −1).
 */
export function groupOpRaw(args: EccGroupArgs, u: number, v: number): number {
  const { kind, p, a } = args;
  if (kind === 0) return (u * v) % p;
  if (kind !== 1) throw new Error(`ecc: 모르는 군 ${kind}`);
  const inf = p * p;
  if (u === inf || v === inf) throw new Error('ecc: O 를 더하려 한다');
  const x1 = Math.floor(u / p);
  const y1 = u % p;
  const x2 = Math.floor(v / p);
  const y2 = v % p;
  if (x1 === x2 && (y1 + y2) % p === 0) return inf;
  let num: number;
  let den: number;
  if (u === v) {
    num = (3 * x1 * x1 + a) % p;
    den = (2 * y1) % p;
  } else {
    num = (y2 - y1 + p) % p;
    den = (x2 - x1 + p) % p;
  }
  const lam = (num * modPow(den, p - 2, p)) % p;
  const x3 = (lam * lam + 2 * p - x1 - x2) % p;
  const y3 = (lam * ((x1 - x3 + p) % p) + p - y1) % p;
  return x3 * p + y3;
}

/** 이 판의 셈 안의 군 연산 — O 가 나오면 던진다. */
export function groupOp(args: EccGroupArgs, u: number, v: number): number {
  const r = groupOpRaw(args, u, v);
  if (args.kind === 1 && r === identityOf(args)) throw new Error('ecc: 셈 도중 O 가 나왔다');
  return r;
}

/** 두 배-더하기 — 높은 비트부터 top 을 // 2 로 내리며 (k // top) % 2 로 읽는다. 길과 셈 수를 함께 낸다. */
export function scalarMulPath(args: EccGroupArgs, k: number, base: number): { code: number; ops: number; path: EccLadderStep[] } {
  if (!isInt(k) || k < 1) throw new Error(`ecc: 곱할 수 ${k} 가 1 이상의 정수가 아니다`);
  let top = 1;
  while (top * 2 <= k) top *= 2;
  let r = base;
  let m = 1;
  let ops = 0;
  let bitIndex = 0;
  const path: EccLadderStep[] = [];
  top = Math.floor(top / 2);
  while (top > 0) {
    bitIndex += 1;
    const fromD = m;
    r = groupOp(args, r, r);
    m *= 2;
    ops += 1;
    path.push({ op: 'double', m, fromM: fromD, code: r, bitIndex });
    if (Math.floor(k / top) % 2 === 1) {
      const fromA = m;
      r = groupOp(args, r, base);
      m += 1;
      ops += 1;
      path.push({ op: 'add', m, fromM: fromA, code: r, bitIndex });
    }
    top = Math.floor(top / 2);
  }
  if (m !== k) throw new Error(`ecc: 두 배-더하기가 ${m} 에 닿았다 (k ${k})`);
  return { code: r, ops, path };
}

/** G 부터 하나씩 더해 target 을 만날 때까지. 길(G..target)과 더한 수를 낸다. */
export function recoverPath(args: EccGroupArgs, target: number): { added: number; path: number[] } {
  let cur = args.g;
  let n = 0;
  const path = [cur];
  const limit = args.p * args.p;
  while (cur !== target) {
    if (n > limit) throw new Error('ecc: 되찾기가 끝나지 않는다');
    cur = groupOp(args, cur, args.g);
    n += 1;
    path.push(cur);
  }
  return { added: n, path };
}

/** G 의 차수 — O(곡선) 또는 1(곱셈)에 닿을 때까지 더한다. */
export function orderOf(args: EccGroupArgs): number {
  const id = identityOf(args);
  let cur = args.g;
  let n = 1;
  while (cur !== id) {
    if (n > args.p * args.p + 1) throw new Error('ecc: 차수가 끝나지 않는다');
    cur = groupOpRaw(args, cur, args.g);
    n += 1;
  }
  return n;
}

export function groupArgs(group: EccGroup): EccGroupArgs {
  if (group.id === 'mul') return { kind: 0, g: group.g, p: group.p, a: 0 };
  const [x, y] = group.G;
  const { p, a, b } = group;
  if ((y * y) % p !== (((x * x * x + a * x + b) % p) + p) % p) throw new Error('ecc: G 가 곡선 위에 있지 않다');
  return { kind: 1, g: x * p + y, p, a };
}

/** 곡선 위 점 목록 — y² ≡ x³ + ax + b (mod p). y = 0 인 점이 있으면 던진다(두 배가 O 로 떨어진다). */
export function curvePoints(group: EccCurveGroup): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let x = 0; x < group.p; x += 1) {
    const rhs = (((x * x * x + group.a * x + group.b) % group.p) + group.p) % group.p;
    for (let y = 0; y < group.p; y += 1) {
      if ((y * y) % group.p === rhs) {
        if (y === 0) throw new Error(`ecc: 곡선에 y = 0 인 점 (${x}, 0) 이 있다`);
        out.push([x, y]);
      }
    }
  }
  return out;
}

/** 한 판의 셈 전부. 화면이 쓰는 값은 모두 여기서 나온다. */
export type EccBoard = {
  group: EccGroup;
  groupIndex: number;
  args: EccGroupArgs;
  order: number;
  k: number;
  bits: number[];
  ladder: EccLadderStep[];
  forward: number;
  aCode: number;
  recoverPath: number[];
  backward: number;
  recovered: number;
  bCode: number;
  kCode: number;
  slots: Array<{ m: number; code: number; x: number; y: number; v: number; identity: boolean; alias: boolean }>;
  marks: number[];
  barMax: number;
};

export function computeBoard(data: EccData, groupIndex: number, k: number): EccBoard {
  const group = data.groups[groupIndex];
  if (group === undefined) throw new Error(`ecc: 모르는 군 ${groupIndex}`);
  const args = groupArgs(group);
  const order = orderOf(args);
  const ladderEnd = Math.max(...data.secretLadder);
  // 사다리 끝이 두 군 모두의 차수보다 작아야 되찾기가 k 를 하나로 정한다.
  for (const g of data.groups) {
    const o = orderOf(groupArgs(g));
    if (!(ladderEnd < o)) throw new Error(`ecc: 사다리 끝 ${ladderEnd} 가 차수 ${o} 보다 작지 않다`);
  }
  if (group.id === 'curve') {
    const pts = curvePoints(group);
    if (pts.length + 1 !== order) throw new Error(`ecc: 점 ${pts.length} + O 가 차수 ${order} 와 다르다 — G 가 곡선을 다 돌지 않는다`);
  }
  // 2진 — 높은 비트부터 top 을 내리며 읽는다 (IR 과 같은 길).
  let top = 1;
  while (top * 2 <= k) top *= 2;
  const bits: number[] = [];
  while (top > 0) {
    bits.push(Math.floor(k / top) % 2);
    top = Math.floor(top / 2);
  }
  const fwd = scalarMulPath(args, k, args.g);
  const rec = recoverPath(args, fwd.code);
  const recovered = rec.added + 1;
  if (recovered !== k) throw new Error(`ecc: 되찾은 k ${recovered} 가 비밀 ${k} 와 다르다`);
  const b = data.peerSecret;
  const bCode = scalarMulPath(args, b, args.g).code;
  const k1 = scalarMulPath(args, k, bCode).code;
  const k2 = scalarMulPath(args, b, fwd.code).code;
  if (k1 !== k2) throw new Error(`ecc: k·B ${k1} 와 b·A ${k2} 가 다르다`);

  // 원소 자리 — 두 군 가운데 큰 차수까지 m 을 세워, 작은 군에선 m 이 차수를 넘으면 alias 로 둔다.
  let slotCount = 0;
  for (const g of data.groups) slotCount = Math.max(slotCount, orderOf(groupArgs(g)));
  const id = identityOf(args);
  const slots: EccBoard['slots'] = [];
  let cur = args.g;
  for (let m = 1; m <= slotCount; m += 1) {
    if (m > 1) cur = cur === id ? args.g : groupOpRaw(args, cur, args.g);
    const identity = cur === id;
    if (args.kind === 1) {
      slots.push({ m, code: cur, x: identity ? -1 : Math.floor(cur / args.p), y: identity ? -1 : cur % args.p, v: -1, identity, alias: m > order });
    } else {
      slots.push({ m, code: cur, x: -1, y: -1, v: cur, identity, alias: m > order });
    }
  }
  const marks: number[] = [];
  if (args.kind === 1) for (let i = 0; i < args.p; i += 1) marks.push(i);
  else for (let i = 1; i < args.p; i += 1) marks.push(i);

  return {
    group,
    groupIndex,
    args,
    order,
    k,
    bits,
    ladder: fwd.path,
    forward: fwd.ops,
    aCode: fwd.code,
    recoverPath: rec.path,
    backward: rec.added,
    recovered,
    bCode,
    kCode: k1,
    slots,
    marks,
    barMax: ladderEnd - 1,
  };
}

// ── 운동 길이 (ms, 재생 속도 1 에서). 무대도 같은 값을 쓴다 — projector 가 payload 로 넘긴다.
export const MOTION_LADDER_MS = 500;
export const MOTION_RECOVER_HOP_MS = 120;
export const MOTION_SHARED_MS = 600;

type InputEvent = { type: string; payload?: unknown };

export async function eccAlgorithm(ctx: FacetContext<EccData>): Promise<void> {
  const rctx = ctx as ReactiveContext<EccData>;
  const data = narrowEccData(ctx.data);
  let group = data.group;
  let secret = data.secret;

  const shown = new Map<string, number>();
  const meter = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev === undefined) ctx.metric(name, value);
    else if (value !== prev) ctx.metric(name, value - prev);
    shown.set(name, value);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playBoard = async (): Promise<boolean> => {
    const bd = computeBoard(data, group, secret);
    meter('forward-ops', 0);
    meter('backward-ops', 0);
    await ctx.emit({
      type: 'init',
      silent: true,
      payload: {
        group: bd.group.id,
        groupIndex: bd.groupIndex,
        p: bd.args.p,
        a: bd.group.id === 'curve' ? bd.group.a : -1,
        b: bd.group.id === 'curve' ? bd.group.b : -1,
        g: bd.args.g,
        identity: identityOf(bd.args),
        order: bd.order,
        k: bd.k,
        bits: bd.bits,
        peer: data.peerSecret,
        barMax: bd.barMax,
        marks: bd.marks,
        slots: bd.slots,
      },
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    let forward = 0;
    for (const st of bd.ladder) {
      if (ctx.cancelled) return false;
      forward += 1;
      if (st.op === 'double') {
        await phase('double');
        await ctx.emit({
          type: 'double',
          payload: { m: st.m, fromM: st.fromM, code: st.code, bitIndex: st.bitIndex, forward, motionMs: MOTION_LADDER_MS },
        });
      } else {
        await phase('add');
        await ctx.emit({
          type: 'add',
          payload: { m: st.m, fromM: st.fromM, code: st.code, bitIndex: st.bitIndex, forward, motionMs: MOTION_LADDER_MS },
        });
      }
      meter('forward-ops', forward);
      if (!(await rctx.sleep(data.stepMs + MOTION_LADDER_MS))) return false;
    }
    if (forward !== bd.forward) throw new Error('ecc: 가는 셈이 길과 맞지 않는다');

    await phase('recover');
    await ctx.emit({
      type: 'recover',
      payload: {
        path: bd.recoverPath,
        added: bd.backward,
        recovered: bd.recovered,
        code: bd.aCode,
        hopMs: MOTION_RECOVER_HOP_MS,
      },
    });
    meter('backward-ops', bd.backward);
    if (!(await rctx.sleep(data.stepMs + MOTION_RECOVER_HOP_MS * bd.backward))) return false;

    await phase('shared');
    await ctx.emit({
      type: 'shared',
      payload: {
        peer: data.peerSecret,
        bCode: bd.bCode,
        aCode: bd.aCode,
        kCode: bd.kCode,
        forward: bd.forward,
        backward: bd.backward,
        motionMs: MOTION_SHARED_MS,
      },
    });
    if (!(await rctx.sleep(data.stepMs + MOTION_SHARED_MS))) return false;
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playBoard())) return;
      // 입력을 기다린다 — 우리 손잡이가 아니거나 사다리 밖이면 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input: InputEvent = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as Record<string, unknown>).value : undefined;
        if (typeof value !== 'number') continue;
        if (input.type === 'group' && data.groupLadder.includes(value)) {
          group = value;
          break;
        }
        if (input.type === 'secret' && data.secretLadder.includes(value)) {
          secret = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
