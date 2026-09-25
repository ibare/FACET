/**
 * rule-match-order 장면.
 *
 * 바탕  규칙 목록 · 패킷 목록 (initialData 에서 베낀다 — 걸음 0 이 이미 읽을 화면)
 * 자취  지금까지 맞춰 본 것 (check 이벤트 차례대로)
 * 이번 걸음  step — 방금 맞춰 본 것과, 이 패킷이 그 앞에 서 있던 줄(from)
 *
 * 맞았는가 · 어느 칸이 어긋났는가는 알고리즘이 셈해 싣는다. 장면은 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  readRuleMatchOrderData,
  type FirewallPacket,
  type FirewallRule,
  type MatchField,
} from './algorithm.js';

export type { FirewallPacket, FirewallRule, MatchField, RuleAction } from './algorithm.js';

export type RuleCheck = {
  packet: number;
  rule: number;
  /** null 이면 네 칸이 다 맞았다 — 그 줄에서 멈춘다 */
  fail: MatchField | null;
};

export type RuleMatchStep = RuleCheck & {
  /** 이 패킷이 방금 전에 서 있던 줄. 목록에 새로 들어왔으면 -1 */
  from: number;
};

export type RuleMatchOrderScene = {
  rules: FirewallRule[];
  packets: FirewallPacket[];
  checks: RuleCheck[];
  step: RuleMatchStep | null;
};

function readField(v: unknown): MatchField | null {
  if (v === null) return null;
  if (v === 'proto' || v === 'src' || v === 'dst' || v === 'port') return v;
  throw new Error('rule-match-order: check.fail 을 모른다');
}

function readIndex(v: unknown, size: number, name: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= size) {
    throw new Error(`rule-match-order: check.${name} 가 목록 밖이다`);
  }
  return v;
}

export const ruleMatchOrderScene: ScenePlan<RuleMatchOrderScene> = {
  initial(initialData: unknown): RuleMatchOrderScene {
    const data = readRuleMatchOrderData(initialData);
    return { rules: data.rules, packets: data.packets, checks: [], step: null };
  },

  reduce(scene: RuleMatchOrderScene, event: FacetRuntimeEvent): RuleMatchOrderScene {
    if (event.type !== 'check') return scene;
    const raw = event.payload;
    if (typeof raw !== 'object' || raw === null) throw new Error('rule-match-order: check 의 payload 가 없다');
    const fields = raw as Record<string, unknown>;
    const check: RuleCheck = {
      packet: readIndex(fields.packet, scene.packets.length, 'packet'),
      rule: readIndex(fields.rule, scene.rules.length, 'rule'),
      fail: readField(fields.fail),
    };
    const last = scene.checks[scene.checks.length - 1];
    const from = last !== undefined && last.packet === check.packet ? last.rule : -1;
    return {
      rules: scene.rules,
      packets: scene.packets,
      checks: [...scene.checks, check],
      step: { ...check, from },
    };
  },
};
