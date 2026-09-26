// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import { acidAlgorithm, acidFacet, acidImperativeIR, acidStageView, type AcidData, type AcidStage } from '../src/index.js';

const data = acidFacet.initialData as AcidData;

type Input = { type: string; payload?: unknown };
type Round = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

/** 알고리즘을 입력 차례대로 돌려 판마다 이벤트와 계기 누적값을 모은다. */
async function drive(d: AcidData, inputs: Input[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals: Record<string, number> = {};
  let events: FacetRuntimeEvent[] = [];
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data: d,
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      if (typeof delta !== 'number') throw new Error('차이는 수여야 한다');
      totals[name] = (totals[name] ?? 0) + delta;
    },
    get cancelled() {
      return cancelled;
    },
    async sleep() {
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      if (events.length > 0) rounds.push({ events, metrics: { ...totals } });
      events = [];
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'none' };
      }
      return next;
    },
  };
  await acidAlgorithm(ctx as unknown as FacetContext<AcidData>);
  return rounds;
}

const payloads = (r: Round, type: string) =>
  r.events.filter((e) => e.type === type).map((e) => e.payload as Record<string, unknown>);

/** 사양 실측표 (`sim.py acid`) — 대조용. */
const TABLE: Record<string, { flushes: number; sent: number; lost: number; half: number; logEnd: number; ok: string; data: number[]; steps: number }> = {
  '0/4': { flushes: 1, sent: 1, lost: 0, half: 0, logEnd: 3, ok: 'T1@3', data: [90, 110, 100, 100], steps: 7 },
  '0/6': { flushes: 2, sent: 2, lost: 0, half: 0, logEnd: 6, ok: 'T1@3 T2@6', data: [90, 90, 120, 100], steps: 10 },
  '0/9': { flushes: 3, sent: 3, lost: 0, half: 0, logEnd: 9, ok: 'T1@3 T2@6 T3@9', data: [90, 90, 90, 130], steps: 14 },
  '0/11': { flushes: 3, sent: 3, lost: 0, half: 0, logEnd: 9, ok: 'T1@3 T2@6 T3@9', data: [90, 90, 90, 130], steps: 16 },
  '1/4': { flushes: 0, sent: 0, lost: 0, half: 0, logEnd: 0, ok: '-', data: [100, 100, 100, 100], steps: 6 },
  '1/6': { flushes: 1, sent: 1, lost: 0, half: 0, logEnd: 5, ok: 'T1@5', data: [90, 110, 100, 100], steps: 10 },
  '1/9': { flushes: 1, sent: 1, lost: 0, half: 0, logEnd: 5, ok: 'T1@5', data: [90, 110, 100, 100], steps: 13 },
  '1/11': { flushes: 2, sent: 3, lost: 0, half: 0, logEnd: 10, ok: 'T1@5 T2@10 T3@10', data: [90, 90, 90, 130], steps: 17 },
  '2/4': { flushes: 0, sent: 1, lost: 1, half: 0, logEnd: 0, ok: 'T1@3', data: [100, 100, 100, 100], steps: 6 },
  '2/6': { flushes: 1, sent: 2, lost: 1, half: 0, logEnd: 5, ok: 'T1@3 T2@6', data: [90, 110, 100, 100], steps: 10 },
  '2/9': { flushes: 1, sent: 3, lost: 2, half: 0, logEnd: 5, ok: 'T1@3 T2@6 T3@9', data: [90, 110, 100, 100], steps: 13 },
  '2/11': { flushes: 2, sent: 3, lost: 0, half: 0, logEnd: 10, ok: 'T1@3 T2@6 T3@9', data: [90, 90, 90, 130], steps: 17 },
};

/** 한 판의 걸음 수 — 처음 + 걸음 경계(sleep) 수. 판 끝의 입력 대기가 마지막 경계다. */
function stepsOf(r: Round): number {
  // sleep 은 가짜라 세지 않고, 걸음을 이루는 사건으로 센다: 처음 · 틱 · 끊김 · 다시 켜기
  return 1 + payloads(r, 'append').length + payloads(r, 'crash').length + payloads(r, 'restart').length;
}

function roundFacts(r: Round) {
  const ok = payloads(r, 'ok')
    .map((p) => `${data.txNames[p.tx as number]}@${p.tick as number}`)
    .join(' ');
  const verdict = payloads(r, 'verdict');
  expect(verdict).toHaveLength(1);
  const restarts = payloads(r, 'restart');
  const last = restarts.at(-1);
  const dataFile = last === undefined ? [...data.start] : (last.data as number[]);
  return {
    ok: ok === '' ? '-' : ok,
    okAt: data.txNames.map((_, tx) => {
      const p = payloads(r, 'ok').find((q) => q.tx === tx);
      return p === undefined ? 0 : (p.tick as number);
    }),
    committed: data.txNames.map((_, tx) => (restarts.some((q) => q.tx === tx && q.redo === true) ? 1 : 0)),
    lost: (verdict[0].lost as number[]).length,
    logEnd: verdict[0].logEnd as number,
    dataFile,
  };
}

function eventArrays() {
  const evTx: number[] = [];
  const evKind: number[] = [];
  data.transfers.forEach((_, tx) => {
    evTx.push(tx, tx, tx);
    evKind.push(0, 0, 1);
  });
  return { evTx, evKind };
}

describe('acid', () => {
  it('사다리가 손잡이 구간과 같다', () => {
    const controls = (acidFacet.blocks.controls as { controls: { name?: string; segments?: { value: number }[] }[] }).controls;
    const seg = (name: string) => controls.find((x) => x.name === name)?.segments?.map((s) => s.value);
    expect(seg('commitMode')).toEqual(data.modeLadder);
    expect(seg('crashAfter')).toEqual(data.crashLadder);
    expect(data.modeLadder).toEqual([0, 1, 2]);
    expect(data.crashLadder.at(-1)).toBe(11);
    expect(data.transfers.length * 3).toBe(12);
  });

  const combos = data.modeLadder.flatMap((m) => data.crashLadder.map((c) => [m, c] as const));

  it.each(combos)('방식 %i · 끊는 틱 %i — 알고리즘이 사양 표 · IR 과 같다', async (mode, crash) => {
    const [round] = await drive({ ...data, commitMode: mode, crashAfter: crash }, []);
    const facts = roundFacts(round);
    const row = TABLE[`${mode}/${crash}`];
    expect(facts.ok).toBe(row.ok);
    expect(facts.lost).toBe(row.lost);
    expect(payloads(round, 'verdict')[0].half).toBe(row.half);
    expect(facts.logEnd).toBe(row.logEnd);
    expect(facts.dataFile).toEqual(row.data);
    expect(stepsOf(round)).toBe(row.steps);
    expect(round.metrics).toEqual({ 'log-flushes': row.flushes, 'ok-sent': row.sent, 'lost-oks': row.lost });

    const { evTx, evKind } = eventArrays();
    const okAt = new Array<number>(data.txNames.length).fill(0);
    const committed = new Array<number>(data.txNames.length).fill(0);
    const lost = runIR(acidImperativeIR, 'runCommits', [mode, crash, data.flushEvery, evTx, evKind, okAt, committed]);
    expect(lost).toBe(facts.lost);
    expect(okAt).toEqual(facts.okAt);
    expect(committed).toEqual(facts.committed);
  });

  it('손잡이 A → B → A — 판마다 계기가 사양 표와 같다 (쌓이지 않는다)', async () => {
    const rounds = await drive(data, [
      { type: 'commitMode', payload: { value: 0, segmentIndex: 0 } },
      { type: 'crashAfter', payload: { value: 4, segmentIndex: 0 } },
      { type: 'commitMode', payload: { value: 2, segmentIndex: 2 } },
      { type: 'crashAfter', payload: { value: 9, segmentIndex: 2 } },
      { type: 'crashAfter', payload: { value: 99, segmentIndex: 9 } },
      { type: 'other', payload: { value: 1 } },
    ]);
    // 사다리 밖 값과 남의 입력은 흘리므로 판은 다섯
    expect(rounds).toHaveLength(5);
    const keys = ['2/9', '0/9', '0/4', '2/4', '2/9'];
    rounds.forEach((r, i) => {
      const row = TABLE[keys[i]];
      expect(r.metrics).toEqual({ 'log-flushes': row.flushes, 'ok-sent': row.sent, 'lost-oks': row.lost });
    });
  });

  it('무대가 기본 판을 그리고 잃은 OK 표지를 떨어뜨린다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(acidStageView, container, { config: {} }) as unknown as AcidStage & { destroy(): void };
    const [round] = await drive(data, []);
    inst.reset({ crashAfter: 9, ticks: 12, rows: data.rows, start: data.start, txNames: data.txNames }, 0);
    for (const e of round.events) {
      const p = e.payload as Record<string, unknown>;
      if (e.type === 'append') inst.append(p as never, 0);
      if (e.type === 'flush') inst.flush(p.upTo as number, 0);
      if (e.type === 'ok') inst.markOk(p.tx as number, p.tick as number, 0);
      if (e.type === 'wait') inst.markWait(p.tx as number, p.tick as number, 0);
      if (e.type === 'crash') inst.crash(p.tick as number, p.unanswered as number[], 0);
      if (e.type === 'restart') inst.restart(p.tx as number, p.redo as boolean, p.lsns as number[], p.data as number[], 0);
      if (e.type === 'verdict') inst.verdict(p.lost as number[], 0);
    }
    const text = container.textContent ?? '';
    expect(text).toContain('<T2,');
    expect(text).toContain('T3 OK');
    expect(payloads(round, 'verdict')[0].half).toBe(0);
    inst.destroy();
  });
});
