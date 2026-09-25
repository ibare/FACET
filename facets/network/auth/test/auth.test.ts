// @vitest-environment happy-dom
/**
 * auth 고유의 검수 — 사양 실측표 · 회차별 계기 · 걸음 차례 · 사다리 · stage 가 판을 끝까지 받는가.
 * IR 은 두지 않으므로 IR ↔ algorithm 대조는 없다 (irs.ts 의 까닭 주석).
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { authAlgorithm, simulateAuth, type AuthData } from '../src/algorithm';
import { authFacet } from '../src/facet';
import { authIRs } from '../src/irs';
import { authProjector } from '../src/projector';
import { authStageView } from '../src/auth-stage';

const data = (): AuthData => structuredClone(authFacet.initialData) as AuthData;

/** 사양 실측표 — 수명: [stolen-passes, tokens-issued, leak-usable-seconds, 앱 통과, 훔친 쪽 거절, 샌 토큰 만료] */
const TABLE: Record<number, [number, number, number, number, number, number]> = {
  30: [0, 15, 0, 30, 54, 40],
  60: [1, 10, 30, 30, 53, 70],
  120: [7, 5, 90, 30, 47, 130],
  300: [25, 2, 270, 30, 29, 310],
  900: [54, 1, 870, 30, 0, 910],
};

const ISSUE_SECS: Record<number, number[]> = {
  30: [10, 50, 90, 130, 170, 210, 250, 290, 330, 370, 410, 450, 490, 530, 570],
  60: [10, 70, 130, 190, 250, 310, 370, 430, 490, 550],
  120: [10, 130, 250, 370, 490],
  300: [10, 310],
  900: [10],
};

type Round = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

/** 알고리즘을 손잡이 값 차례대로 돌려 판마다 계기 누적과 발신을 모은다. */
async function drive(values: number[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals: Record<string, number> = {};
  let current: Round = { events: [], metrics: totals };
  const queue = [...values];
  let cancelled = false;
  let idle!: () => void;
  const done = new Promise<void>((r) => (idle = r));
  const ctx = {
    data: data(),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async emit(e: FacetRuntimeEvent) {
      current.events.push(e);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ events: current.events, metrics: { ...totals } });
      const v = queue.shift();
      if (v === undefined) {
        idle();
        return new Promise<never>(() => {});
      }
      current = { events: [], metrics: totals };
      return { type: 'lifetime', payload: { value: v, segmentIndex: 0, lifetime: String(v) } };
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([authAlgorithm(ctx as never), done]);
  cancelled = true;
  return rounds;
}

describe('auth', () => {
  it('사다리 = segments[].value, 기본값 = initialData.lifetime', () => {
    const d = data();
    const bar = authFacet.blocks.controls as { controls: { widget?: string; segments?: { value: number; default?: boolean }[] }[] };
    const knob = bar.controls.find((c) => c.widget === 'segmented-slider');
    expect(knob?.segments?.map((s) => s.value)).toEqual(d.lifetimeLadder);
    expect(d.lifetimeLadder).toEqual([30, 60, 120, 300, 900]);
    expect(knob?.segments?.find((s) => s.default)?.value).toBe(d.lifetime);
    expect(d.lifetime).toBe(300);
    expect(authIRs).toEqual([]);
  });

  it('실측표 — 수명마다 셈이 사양 표와 같다', () => {
    for (const life of [30, 60, 120, 300, 900]) {
      const r = simulateAuth(data(), life);
      const [stolen, issued, usable, appPass, stolenReject, leakExp] = TABLE[life]!;
      expect(r.app.length).toBe(30);
      expect(r.attacker.length).toBe(54);
      expect(r.attacker.filter((q) => q.status === 200).length, `수명 ${life} 훔친 쪽 통과`).toBe(stolen);
      expect(r.tokens.length, `수명 ${life} 발급`).toBe(issued);
      expect(r.leak.usableSec, `수명 ${life} 샌 뒤`).toBe(usable);
      expect(r.app.filter((q) => q.status === 200).length).toBe(appPass);
      expect(r.attacker.filter((q) => q.status === 401).length).toBe(stolenReject);
      expect(r.leak.expiresSec).toBe(leakExp);
      expect(r.leak.token).toBe(1);
      expect(r.tokens.map((k) => k.issuedSec)).toEqual(ISSUE_SECS[life]);
    }
  });

  it('사다리 밖 수명은 던진다', () => {
    expect(() => simulateAuth(data(), 45)).toThrow();
  });

  it('회차별 계기 — 300 → 30 → 300', async () => {
    const rounds = await drive([30, 300]);
    expect(rounds.map((r) => r.metrics)).toEqual([
      { 'stolen-passes': 25, 'tokens-issued': 2, 'leak-usable-seconds': 270 },
      { 'stolen-passes': 0, 'tokens-issued': 15, 'leak-usable-seconds': 0 },
      { 'stolen-passes': 25, 'tokens-issued': 2, 'leak-usable-seconds': 270 },
    ]);
  });

  it('회차별 계기 — 사다리 전부', async () => {
    const order = [30, 60, 120, 900, 300];
    const rounds = await drive(order);
    const want = [300, ...order].map((life) => {
      const [s, i, u] = TABLE[life]!;
      return { 'stolen-passes': s, 'tokens-issued': i, 'leak-usable-seconds': u };
    });
    expect(rounds.map((r) => r.metrics)).toEqual(want);
  });

  it('걸음 차례 — 판마다 7 걸음, 수명 300 의 창별 증가가 사양과 같다', async () => {
    const [first] = await drive([]);
    const steps = first!.events.filter((e) => e.type === 'round' || e.type === 'window');
    expect(steps.length).toBe(7);
    const wins = steps.slice(1).map((e) => (e.payload as { counts: { stolenPass: number; issued: number; stolenReject: number } }).counts);
    expect(wins.map((c) => c.stolenPass)).toEqual([5, 10, 10, 0, 0, 0]);
    expect(wins.map((c) => c.issued)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(wins.map((c) => c.stolenReject)).toEqual([0, 0, 0, 10, 10, 9]);
    const leakAt = steps.slice(1).map((e) => (e.payload as { leak: unknown }).leak !== null);
    expect(leakAt).toEqual([true, false, false, false, false, false]);
  });

  it('stage 가 판 둘을 끝까지 받는다 — 걸음 끝 화면의 점이 캡션의 누적과 같다', async () => {
    const rounds = await drive([30]);
    const container = document.createElement('div');
    const stage = mountView(authStageView, container, { config: {}, initialData: data(), locale: 'ko', isInstant: () => true });
    const projector = authProjector({ stage }, { getSpeed: () => 1, t: (_k, en) => en });
    for (const r of rounds) for (const e of r.events) await projector.onEvent(e);
    const svg = container.querySelector('svg')!;
    // 수명 30: 훔친 쪽 쉰넷 모두 거절 — 속 빈 점(fill none)이 앱 줄 · 훔친 쪽 줄을 합쳐 54
    const circles = [...svg.querySelectorAll('circle')].filter((c) => c.getAttribute('r') === '3.5');
    const hollow = circles.filter((c) => c.getAttribute('fill') === 'none' && c.getAttribute('stroke-width') === '1.5');
    expect(hollow.length - 1).toBe(54); // 범례의 속 빈 점 하나를 뺀다
    // 발급 막대 15 (앞 판의 막대는 합쳐 사라지거나 새 막대로 옮겨 갔다)
    const bars = [...svg.querySelectorAll('rect')].filter((r) => r.getAttribute('height') === '14' && r.getAttribute('stroke-dasharray') === null && r.getAttribute('fill-opacity') === '0.28');
    expect(bars.length).toBe(15);
    stage.destroy();
  });
});
