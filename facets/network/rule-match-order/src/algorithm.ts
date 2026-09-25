/**
 * rule-match-order — 방화벽은 한 패킷에 맞는 규칙이 여럿일 때 어느 것을 따르는가.
 *
 * 패킷 하나가 규칙 목록을 위에서부터 한 줄씩 내려가며 맞춰 보고, 처음 맞는 줄에서
 * 멈춘다. 그 아래 줄은 그 패킷에게 없는 것과 같다.
 *
 * 규약 (사양 그대로)
 *   - 한 걸음 = 패킷 하나를 규칙 한 줄에 맞춰 보기. 패킷은 앞 패킷이 끝난 뒤 들어온다.
 *   - 한 줄이 맞는다 = 네 칸이 모두 맞는다. 칸을 보는 차례: 프로토콜 → 보낸 주소 →
 *     받는 주소 → 포트. 안 맞으면 이 차례에서 처음 어긋난 칸 하나를 싣는다.
 *   - 주소 칸 `a.b.c.d/k` 는 앞 k 비트가 같으면 맞다 (/32 는 그 주소 하나).
 *     `any` 는 무엇이든 맞다. 프로토콜 · 포트도 `any` 가 아니면 같아야 맞다.
 *   - 처음 맞은 줄의 동작을 따르고 그 패킷의 내려가기를 멈춘다. 어느 줄에도 안 맞으면
 *     던진다. 가장 구체적인 줄을 고르지 않는다.
 *   - 상태를 보지 않는 거르개 — 연결 추적 · 보낸 포트 · 돌아오는 패킷은 없다.
 *
 * 이벤트
 *   check  { packet: number; rule: number; fail: 'proto' | 'src' | 'dst' | 'port' | null }
 *          packet · rule 은 목록의 자리(0 부터). fail 이 null 이면 네 칸이 다 맞아
 *          그 줄의 동작을 따르고 멈춘다. silent 아님 — 한 걸음.
 *
 * 걸음 0 은 규칙 목록과 기다리는 패킷이 이미 있는 화면이라, 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RuleAction = 'allow' | 'deny';
export type MatchField = 'proto' | 'src' | 'dst' | 'port';

export type FirewallRule = {
  action: RuleAction;
  proto: string;
  src: string;
  dst: string;
  port: string;
};

export type FirewallPacket = {
  id: string;
  proto: string;
  src: string;
  dst: string;
  port: number;
};

export type RuleMatchOrderFacetData = {
  type: 'rule-match-order';
  stepMs: number;
  rules: FirewallRule[];
  packets: FirewallPacket[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function needString(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') throw new Error(`rule-match-order: ${where}.${key} 가 문자열이 아니다`);
  return v;
}

/** initialData 를 좁힌다. 모르는 모양은 던진다. 값은 베낀다. */
export function readRuleMatchOrderData(raw: unknown): RuleMatchOrderFacetData {
  if (!isRecord(raw)) throw new Error('rule-match-order: initialData 가 객체가 아니다');
  if (raw.type !== 'rule-match-order') throw new Error('rule-match-order: initialData.type 이 다르다');
  const stepMs = raw.stepMs;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) throw new Error('rule-match-order: stepMs 가 없다');
  if (!Array.isArray(raw.rules) || raw.rules.length === 0) throw new Error('rule-match-order: rules 가 비었다');
  if (!Array.isArray(raw.packets) || raw.packets.length === 0) throw new Error('rule-match-order: packets 가 비었다');

  const rules = raw.rules.map((r: unknown, i: number): FirewallRule => {
    const where = `rules[${i}]`;
    if (!isRecord(r)) throw new Error(`rule-match-order: ${where} 가 객체가 아니다`);
    const action = r.action;
    if (action !== 'allow' && action !== 'deny') throw new Error(`rule-match-order: ${where}.action 을 모른다`);
    const rule: FirewallRule = {
      action,
      proto: needString(r, 'proto', where),
      src: needString(r, 'src', where),
      dst: needString(r, 'dst', where),
      port: needString(r, 'port', where),
    };
    // 모양을 미리 확인한다 — 셈하다가 조용히 틀리지 않게
    parseRange(rule.src);
    parseRange(rule.dst);
    parsePortSpec(rule.port);
    return rule;
  });

  const packets = raw.packets.map((p: unknown, i: number): FirewallPacket => {
    const where = `packets[${i}]`;
    if (!isRecord(p)) throw new Error(`rule-match-order: ${where} 가 객체가 아니다`);
    const port = p.port;
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`rule-match-order: ${where}.port 가 포트 수가 아니다`);
    }
    const packet: FirewallPacket = {
      id: needString(p, 'id', where),
      proto: needString(p, 'proto', where),
      src: needString(p, 'src', where),
      dst: needString(p, 'dst', where),
      port,
    };
    parseAddress(packet.src);
    parseAddress(packet.dst);
    return packet;
  });

  return { type: 'rule-match-order', stepMs, rules, packets };
}

/** 점 표기 IPv4 를 32 비트 부호 없는 수로. */
function parseAddress(text: string): number {
  const parts = text.split('.');
  if (parts.length !== 4) throw new Error(`rule-match-order: 주소 ${text} 를 읽을 수 없다`);
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) throw new Error(`rule-match-order: 주소 ${text} 를 읽을 수 없다`);
    const octet = Number(part);
    if (octet > 255) throw new Error(`rule-match-order: 주소 ${text} 를 읽을 수 없다`);
    value = value * 256 + octet;
  }
  return value;
}

type Range = { any: true } | { any: false; base: number; bits: number };

function parseRange(text: string): Range {
  if (text === 'any') return { any: true };
  const slash = text.split('/');
  if (slash.length !== 2 || !/^\d{1,2}$/.test(slash[1] ?? '')) {
    throw new Error(`rule-match-order: 범위 ${text} 를 읽을 수 없다`);
  }
  const bits = Number(slash[1]);
  if (bits > 32) throw new Error(`rule-match-order: 범위 ${text} 의 접두사가 32 를 넘는다`);
  return { any: false, base: parseAddress(slash[0] ?? ''), bits };
}

function parsePortSpec(text: string): number | 'any' {
  if (text === 'any') return 'any';
  if (!/^\d{1,5}$/.test(text) || Number(text) > 65535) throw new Error(`rule-match-order: 포트 ${text} 를 읽을 수 없다`);
  return Number(text);
}

/** 앞 bits 비트가 같은가. 2^32 안쪽이라 나눗셈으로 윗자리를 떼어 견준다. */
function inRange(addr: string, spec: string): boolean {
  const range = parseRange(spec);
  if (range.any) return true;
  const drop = 2 ** (32 - range.bits);
  return Math.floor(parseAddress(addr) / drop) === Math.floor(range.base / drop);
}

/** 규약의 차례(프로토콜 → 보낸 주소 → 받는 주소 → 포트)로 처음 어긋난 칸. 다 맞으면 null. */
export function firstMismatch(rule: FirewallRule, packet: FirewallPacket): MatchField | null {
  if (rule.proto !== 'any' && rule.proto !== packet.proto) return 'proto';
  if (!inRange(packet.src, rule.src)) return 'src';
  if (!inRange(packet.dst, rule.dst)) return 'dst';
  const port = parsePortSpec(rule.port);
  if (port !== 'any' && port !== packet.port) return 'port';
  return null;
}

export async function ruleMatchOrder(ctxIn: FacetContext<RuleMatchOrderFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<RuleMatchOrderFacetData>;
  const data = readRuleMatchOrderData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (let p = 0; p < data.packets.length; p += 1) {
    if (ctx.cancelled) return;
    const packet = data.packets[p]!;
    let stopped = false;
    for (let r = 0; r < data.rules.length; r += 1) {
      if (!(await pause())) return;
      const fail = firstMismatch(data.rules[r]!, packet);
      await ctx.emit({ type: 'check', payload: { packet: p, rule: r, fail } });
      if (fail === null) {
        stopped = true;
        break;
      }
    }
    if (!stopped) throw new Error(`rule-match-order: 패킷 ${packet.id} 가 어느 규칙에도 맞지 않는다`);
  }
}
