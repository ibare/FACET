/**
 * 방화벽 — 규칙의 자리.
 *
 * 규칙 넷(R1–R4)과 패킷 여섯(p1–p6)이 있다. 손잡이 `position` 이 차단 줄 R2 를 목록의 몇 번째 자리에
 * 둘지 정한다 — 나머지 셋(R1 · R3 · R4)은 원래 차례를 지키고 R2 만 그 자리에 끼운다. 패킷은 차례로
 * 목록을 위에서부터 내려가 **처음 맞은 줄**의 동작을 따르고 멈춘다. 상태를 보지 않는 거르개다.
 *
 * 한 줄이 맞는다 = 프로토콜 → 보낸 주소 → 받는 주소 → 포트 넷이 모두 맞는다. `any` 는 무엇이든 맞고,
 * `a.b.c.d/k` 는 앞 k 비트가 같으면 맞다. 셈은 코드 패널(IR `firstMatch`)과 같은 꼴 — 주소를 옥텟 배열로
 * 펴고, 옥텟마다 견주며, 걸친 옥텟은 2^(8−남은 비트) 로 나눈 몫을 견준다. `any` 주소는 `0.0.0.0/0`,
 * `any` 프로토콜 · 포트는 −1, `tcp` 는 6 으로 건넨다.
 *
 * 동률: 처음 맞은 줄에서 멈추므로 판정이 갈리는 동률이 없다. 같은 자리에 둘이 설 수 없다.
 * 어느 줄에도 안 맞는 패킷은 던진다 (R4 가 모두 받아 이 데이터에서는 일어나지 않는다).
 *
 * ── 이벤트 ─────────────────────────────────────────────────────────────
 *   order   { position: number, rule: string, order: string[] }          걸음 0 — 지금 차례의 규칙 목록
 *           position = 옮기는 줄(rule, 여기선 R2)의 자리(1 부터), order = 자리 1.. 에 선 규칙 id
 *   packet  { index: number, packet: string, depth: number, rule: string,
 *             action: 'allow' | 'deny' }                                   걸음 1–6 — 패킷 하나가 제 깊이까지 내려가 멈춘다
 *           index = 패킷 차례(0 부터), depth = 처음 맞은 줄의 자리(1 부터), rule = 그 줄의 id
 *   dead    { dead: string[], count: number }                             걸음 7 — 한 번도 먼저 맞지 않은 줄
 *           dead = 그런 줄의 id (자리 차례), count = 그 수
 *   phase   { phase: string }                                     silent  코드 패널 줄 표시
 *
 * ── phase 어휘 ─────────────────────────────────────────────────────────
 *   stop-first          firstMatch 의 `return j + 1` — 패킷이 처음 맞은 줄에서 멈춘다 (걸음 1–6)
 *   check-never-first   runAll 끝 반복의 `if hits[order[j]] == 0` — 죽은 줄을 센다 (걸음 7)
 *   걸음 0 에는 켜지는 phase 가 없다
 *
 * ── 계기 ───────────────────────────────────────────────────────────────
 *   allowed       허용으로 끝난 패킷 수
 *   denied        차단으로 끝난 패킷 수
 *   rule-checks   맞춰 본 줄 수 — 패킷마다의 깊이 합
 *   dead-rules    죽은 줄 수 (걸음 7)
 *   판이 바뀌면 걸음 0 에서 넷 다 0 으로 되돌린다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FirewallAction = 'allow' | 'deny';

export type FirewallRule = {
  id: string;
  action: FirewallAction;
  proto: string;
  src: string;
  dst: string;
  port: number | 'any';
};

export type FirewallPacket = {
  id: string;
  proto: string;
  src: string;
  dst: string;
  port: number;
};

export type FirewallData = {
  type: 'firewall';
  stepMs: number;
  rules: FirewallRule[];
  packets: FirewallPacket[];
  movingRule: string;
  positionLadder: number[];
  position: number;
};

/** IR 에 건네는 꼴로 편 배열 — sim.py `fw_arrays` 와 같다. */
export type FirewallArrays = {
  order: number[];
  proto: number[];
  src: number[];
  srcLen: number[];
  dst: number[];
  dstLen: number[];
  port: number[];
  pProto: number[];
  pSrc: number[];
  pDst: number[];
  pPort: number[];
};

export type FirewallRound = {
  position: number;
  order: string[];
  depth: number[];
  hitRule: string[];
  action: FirewallAction[];
  allowed: number;
  denied: number;
  ruleChecks: number;
  dead: string[];
};

const PROTO_NUMBER: Record<string, number> = { tcp: 6, any: -1 };

function protoNumber(p: string): number {
  const n = PROTO_NUMBER[p];
  if (n === undefined) throw new Error(`firewall: 모르는 프로토콜 ${p}`);
  return n;
}

function parseOctets(ip: string): number[] {
  const parts = ip.split('.');
  if (parts.length !== 4) throw new Error(`firewall: 주소 모양이 아니다 ${ip}`);
  return parts.map((s) => {
    if (!/^\d{1,3}$/.test(s)) throw new Error(`firewall: 옥텟이 아니다 ${ip}`);
    const v = Number(s);
    if (v > 255) throw new Error(`firewall: 옥텟이 255 를 넘는다 ${ip}`);
    return v;
  });
}

/** 'any' 는 0.0.0.0/0 — 견줄 비트가 없어 늘 맞는다. */
function parseNet(s: string): { octets: number[]; len: number } {
  if (s === 'any') return { octets: [0, 0, 0, 0], len: 0 };
  const [net, k, ...rest] = s.split('/');
  if (net === undefined || k === undefined || rest.length > 0 || !/^\d{1,2}$/.test(k)) {
    throw new Error(`firewall: 망 모양이 아니다 ${s}`);
  }
  const len = Number(k);
  if (len > 32) throw new Error(`firewall: 접두 길이가 32 를 넘는다 ${s}`);
  return { octets: parseOctets(net), len };
}

/** 자리 p(1 부터)의 차례 — R2 를 p 번째에 끼우고 나머지는 원래 차례. 규칙 번호(0 부터)의 배열. */
export function orderFor(data: FirewallData, position: number): number[] {
  if (!data.positionLadder.includes(position)) {
    throw new Error(`firewall: 사다리 밖의 자리 ${position}`);
  }
  const moving = data.rules.findIndex((r) => r.id === data.movingRule);
  if (moving < 0) throw new Error(`firewall: 옮길 줄 ${data.movingRule} 이 목록에 없다`);
  const others: number[] = [];
  for (let i = 0; i < data.rules.length; i++) if (i !== moving) others.push(i);
  if (position < 1 || position > data.rules.length) {
    throw new Error(`firewall: 자리 ${position} 가 목록 밖이다`);
  }
  return [...others.slice(0, position - 1), moving, ...others.slice(position - 1)];
}

export function firewallArrays(data: FirewallData, position: number): FirewallArrays {
  const src: number[] = [];
  const srcLen: number[] = [];
  const dst: number[] = [];
  const dstLen: number[] = [];
  for (const r of data.rules) {
    const s = parseNet(r.src);
    src.push(...s.octets);
    srcLen.push(s.len);
    const d = parseNet(r.dst);
    dst.push(...d.octets);
    dstLen.push(d.len);
  }
  return {
    order: orderFor(data, position),
    proto: data.rules.map((r) => protoNumber(r.proto)),
    src,
    srcLen,
    dst,
    dstLen,
    port: data.rules.map((r) => (r.port === 'any' ? -1 : r.port)),
    pProto: data.packets.map((p) => protoNumber(p.proto)),
    pSrc: data.packets.flatMap((p) => parseOctets(p.src)),
    pDst: data.packets.flatMap((p) => parseOctets(p.dst)),
    pPort: data.packets.map((p) => p.port),
  };
}

/** IR `prefixMatch` 와 같은 셈 — addr[ao..ao+3] 과 net[no..no+3] 의 앞 k 비트. */
function prefixMatch(addr: number[], ao: number, net: number[], no: number, k: number): boolean {
  for (let i = 0; i < 4; i++) {
    const left = k - 8 * i;
    if (left <= 0) return true;
    const a = addr[ao + i];
    const n = net[no + i];
    if (a === undefined || n === undefined) throw new Error('firewall: 옥텟 색인이 배열 밖이다');
    if (left >= 8) {
      if (a !== n) return false;
    } else {
      let d = 1;
      for (let s = 0; s < 8 - left; s++) d = d * 2;
      if (Math.floor(a / d) !== Math.floor(n / d)) return false;
    }
  }
  return true;
}

function at(arr: number[], i: number): number {
  const v = arr[i];
  if (v === undefined) throw new Error(`firewall: 색인 ${i} 가 배열 밖이다`);
  return v;
}

/** IR `firstMatch` 와 같은 셈 — 패킷 p 가 처음 맞은 자리(1 부터), 없으면 0. */
export function firstMatch(a: FirewallArrays, p: number): number {
  for (let j = 0; j < a.order.length; j++) {
    const r = at(a.order, j);
    let ok = true;
    if (at(a.proto, r) >= 0 && at(a.proto, r) !== at(a.pProto, p)) ok = false;
    if (ok && !prefixMatch(a.pSrc, 4 * p, a.src, 4 * r, at(a.srcLen, r))) ok = false;
    if (ok && !prefixMatch(a.pDst, 4 * p, a.dst, 4 * r, at(a.dstLen, r))) ok = false;
    if (ok && at(a.port, r) >= 0 && at(a.port, r) !== at(a.pPort, p)) ok = false;
    if (ok) return j + 1;
  }
  return 0;
}

/** 한 판 전부를 셈한다 — 화면 · 검사 · 계기가 같은 값을 본다. */
export function firewallRound(data: FirewallData, position: number): FirewallRound {
  const a = firewallArrays(data, position);
  const order = a.order.map((i) => ruleAt(data, i).id);
  const depth: number[] = [];
  const hitRule: string[] = [];
  const action: FirewallAction[] = [];
  for (let p = 0; p < data.packets.length; p++) {
    const d = firstMatch(a, p);
    if (d === 0) throw new Error(`firewall: 패킷 ${data.packets[p]?.id} 이 어느 줄에도 맞지 않는다`);
    const rule = ruleAt(data, at(a.order, d - 1));
    depth.push(d);
    hitRule.push(rule.id);
    action.push(rule.action);
  }
  const dead = order.filter((id) => !hitRule.includes(id));
  return {
    position,
    order,
    depth,
    hitRule,
    action,
    allowed: action.filter((x) => x === 'allow').length,
    denied: action.filter((x) => x === 'deny').length,
    ruleChecks: depth.reduce((s, x) => s + x, 0),
    dead,
  };
}

function ruleAt(data: FirewallData, i: number): FirewallRule {
  const r = data.rules[i];
  if (r === undefined) throw new Error(`firewall: 규칙 번호 ${i} 가 없다`);
  return r;
}

function readPosition(payload: unknown, ladder: number[]): number {
  if (typeof payload !== 'object' || payload === null) throw new Error('firewall: 손잡이 payload 가 없다');
  const value = (payload as { value?: unknown }).value;
  if (typeof value !== 'number' || !ladder.includes(value)) {
    throw new Error(`firewall: 사다리 밖의 손잡이 값 ${String(value)}`);
  }
  return value;
}

export async function firewallAlgorithm(ctx: FacetContext<FirewallData>): Promise<void> {
  const rctx = ctx as ReactiveContext<FirewallData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 지금 보이는 계기 값 — 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev === undefined || prev !== value) ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  /** 한 판을 끝까지 재생한다. 취소되면 false. */
  const playRound = async (position: number): Promise<boolean> => {
    const round = firewallRound(data, position);

    setMetric('allowed', 0);
    setMetric('denied', 0);
    setMetric('rule-checks', 0);
    setMetric('dead-rules', 0);
    await ctx.emit({ type: 'order', payload: { position, rule: data.movingRule, order: round.order } });
    if (!(await rctx.sleep(data.stepMs))) return false;

    let allowed = 0;
    let denied = 0;
    let checks = 0;
    for (let p = 0; p < data.packets.length; p++) {
      if (ctx.cancelled) return false;
      const packet = data.packets[p];
      const depth = round.depth[p];
      const rule = round.hitRule[p];
      const action = round.action[p];
      if (packet === undefined || depth === undefined || rule === undefined || action === undefined) {
        throw new Error(`firewall: 패킷 ${p} 의 셈이 비었다`);
      }
      if (action === 'allow') allowed += 1;
      else denied += 1;
      checks += depth;
      await phase('stop-first');
      await ctx.emit({ type: 'packet', payload: { index: p, packet: packet.id, depth, rule, action } });
      setMetric('allowed', allowed);
      setMetric('denied', denied);
      setMetric('rule-checks', checks);
      if (!(await rctx.sleep(data.stepMs))) return false;
    }

    if (ctx.cancelled) return false;
    await phase('check-never-first');
    await ctx.emit({ type: 'dead', payload: { dead: round.dead, count: round.dead.length } });
    setMetric('dead-rules', round.dead.length);
    return true;
  };

  try {
    let position = data.position;
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(position))) return;
      // 한 판이 끝났다 — 손잡이를 기다린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'position') continue;
        position = readPosition(input.payload, data.positionLadder);
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
