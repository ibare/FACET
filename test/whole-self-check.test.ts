/**
 * 완제품 자체 검증 — 완제품(projector facet) 하나를 좁혀서 잰다.
 *
 * `FACET_ONLY=<디렉터리 이름,...>` 이 있을 때만 돈다. 부르는 곳은 `scripts/whole-check.mjs` 다.
 * 평소의 `pnpm test` 에서는 건너뛴다 — 기존 완제품 아흔여섯은 이 잣대 이전에 만들어졌다.
 *
 * 앞 배치들의 완제품 에이전트는 이 검사를 facet 마다 테스트로 새로 짰다 (2026-09-18 배치에서
 * vitest 187 회, 합 46 분). 그런데 재는 것은 어느 완제품에나 같았고, 서로 못 보는 에이전트들이
 * 같은 자리에 **각자** 걸렸다 (`tasks/whole-batch-protocol.md` "사양에 넣을 것"). 그 공통분을 여기
 * 한 벌로 둔다. 완제품 고유의 주장(IR 과 algorithm 이 모든 손잡이 조합에서 같은 답을 내는가, 사양
 * 표와 같은가)은 여기서 재지 않는다 — 그것은 facet 의 `test/<topic>.test.ts` 몫이다.
 *
 * 재는 것:
 *
 *   손잡이     `segmented-slider` 가 있으면 `mechanismKind: 'reactive'` 다. 값을 바꾸면 알고리즘이
 *              무언가를 보낸다 (손잡이가 알고리즘에 닿는다)
 *   phase      algorithm 이 보낸 phase 집합 = IR 의 phase 집합 (C3), 그리고 **걸음 경계마다 켜진
 *              phase** 를 모은 집합 = IR 의 phase 집합 (덮이는 phase — 경계는 `sleep` 과 입력 대기)
 *   계기       보낸 이름이 모두 선언되어 있다 (C5). 선언한 이름은 첫 판에 모두 실린다 (델타 0 이라도).
 *              손잡이를 A → B → A 로 돌렸을 때 첫 판과 셋째 판의 계기가 같다 (판마다 쌓이지 않는다)
 *   IR         여섯 transpiler 가 모두 옮긴다. IR 주석에 한글이 없다 (코드 패널은 열 언어 화면에 그대로 뜬다)
 */
import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithm,
  getAlgorithmMechanismKind,
  getFacetById,
  getIR,
  listFacets,
  stripPrefix,
} from '@ffacet/core/runtime';
import type { FacetJson, FacetRuntimeEvent, IR, IRStmt, Transpiler } from '@ffacet/core';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * 좁혀 돌릴 facet 디렉터리 이름들 — `FACET_ONLY=top-k-top-p,kv-cache`.
 *
 * `packages/core/test/facet-modules.ts` 의 `import.meta.glob` 은 루트 tsc 에서 vite 타입과 부딪히므로
 * 여기서는 디렉터리를 직접 찾는다 (`facet-i18n.test.ts` 와 같은 사정).
 */
const FACET_ONLY: string[] = (process.env.FACET_ONLY ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function entryOf(name: string): string | null {
  const facets = join(repoRoot, 'facets');
  for (const domain of readdirSync(facets)) {
    const entry = join(facets, domain, name, 'src', 'index.ts');
    if (existsSync(entry)) return entry;
  }
  return null;
}

const TRANSPILERS: Transpiler[] = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

type Knob = { action: string; name: string; values: number[]; initial: number };
type Input = { type: string; payload: Record<string, unknown> };
type Round = { events: FacetRuntimeEvent[]; metrics: Map<string, number>; lit: Set<string>; input: string };

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

async function load(name: string): Promise<FacetJson | null> {
  const entry = entryOf(name);
  if (!entry) throw new Error(`facet 모듈을 찾지 못했다: ${name}`);
  clearRegistry();
  const mod = (await import(pathToFileURL(entry).href)) as Record<string, unknown>;
  for (const [k, v] of Object.entries(mod)) {
    if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
  }
  const facet = listFacets()
    .map((id) => getFacetById(id))
    .find((f): f is FacetJson => f !== undefined);
  if (!facet) throw new Error(`등록된 facet 이 없다: ${name}`);
  return typeof facet.scene === 'string' ? null : facet;
}

function knobsOf(facet: FacetJson): Knob[] {
  const out: Knob[] = [];
  for (const block of Object.values(facet.blocks ?? {})) {
    const b = block as { type?: unknown; controls?: unknown };
    if (b.type !== 'control-bar' || !Array.isArray(b.controls)) continue;
    for (const c of b.controls as Record<string, unknown>[]) {
      if (c.widget !== 'segmented-slider' || !Array.isArray(c.segments)) continue;
      const segs = c.segments as { value: unknown; default?: unknown }[];
      const values = segs.map((s) => s.value).filter((v): v is number => typeof v === 'number');
      const def = segs.find((s) => s.default === true)?.value;
      out.push({
        action: String(c.action),
        name: String(c.name ?? c.action),
        values,
        initial: typeof def === 'number' ? def : (values[0] ?? 0),
      });
    }
  }
  return out;
}

function declaredMetrics(facet: FacetJson): string[] {
  const out: string[] = [];
  for (const block of Object.values(facet.blocks ?? {})) {
    const b = block as { metrics?: unknown };
    if (!Array.isArray(b.metrics)) continue;
    for (const m of b.metrics as { name?: unknown }[]) if (typeof m.name === 'string') out.push(m.name);
  }
  return out;
}

function irsOf(facet: FacetJson): IR[] {
  const out: IR[] = [];
  for (const block of Object.values(facet.blocks ?? {})) {
    const b = block as { type?: unknown; ir?: unknown };
    if (b.type !== 'code-view' || typeof b.ir !== 'string') continue;
    const ir = getIR(stripPrefix(b.ir, 'ir'));
    if (ir) out.push(ir);
  }
  return out;
}

function walk(stmts: IRStmt[], visit: (s: IRStmt) => void): void {
  for (const s of stmts) {
    visit(s);
    if (s.kind === 'if') {
      walk(s.then, visit);
      if (s.else) walk(s.else, visit);
    } else if (s.kind === 'for-range' || s.kind === 'while') walk(s.body, visit);
  }
}

/**
 * 판 차례 — 첫 판은 기본값. 손잡이마다 기본값이 아닌 값을 차례로 한 번씩 거치고 기본값으로 돌아온다.
 * 손잡이가 둘 이상이고 칸이 `COMBO_LIMIT` 이하면 이어서 모든 조합을 한 번씩 거치고 다시 기본값으로 돌아온다.
 * 돌아온 판(`back`)이 첫 판과 같은 계기를 내야 한다.
 */
const COMBO_LIMIT = 40;

function planOf(knobs: Knob[]): { inputs: Input[]; backRounds: number[] } {
  const state: Record<string, string> = {};
  for (const k of knobs) state[k.name] = String(k.initial);
  const inputs: Input[] = [];
  const backRounds: number[] = [];
  const set = (k: Knob, v: number) => {
    state[k.name] = String(v);
    inputs.push({ type: k.action, payload: { value: v, segmentIndex: k.values.indexOf(v), ...state } });
  };
  for (const k of knobs) {
    const others = k.values.filter((v) => v !== k.initial);
    if (others.length === 0) continue;
    for (const v of others) set(k, v);
    set(k, k.initial);
    backRounds.push(inputs.length); // 판 번호 = 받은 입력 수
  }
  // 손잡이 둘 이상을 함께 돌려야 닿는 칸이 있다 (예: 갈라짐 있음 × 기다릴 수 2 에서만 켜지는 phase).
  // 하나씩만 돌리면 그 칸에 끝내 닿지 않아, 조합이 작으면 모든 칸을 한 번씩 거치고 기본값으로 돌아온다
  // (2026-09-26 데이터베이스 replication).
  const product = knobs.reduce((n, k) => n * k.values.length, 1);
  if (knobs.length >= 2 && product <= COMBO_LIMIT) {
    const current: Record<string, number> = {};
    for (const k of knobs) current[k.name] = k.initial;
    const visit = (i: number, combo: Record<string, number>): void => {
      if (i === knobs.length) {
        for (const k of knobs) {
          if (current[k.name] !== combo[k.name]) {
            current[k.name] = combo[k.name]!;
            set(k, combo[k.name]!);
          }
        }
        return;
      }
      for (const v of knobs[i]!.values) visit(i + 1, { ...combo, [knobs[i]!.name]: v });
    };
    visit(0, {});
    const before = inputs.length;
    for (const k of knobs) if (current[k.name] !== k.initial) set(k, k.initial);
    if (inputs.length > before) backRounds.push(inputs.length);
  }
  return { inputs, backRounds };
}

/**
 * 알고리즘을 돌려 판마다 모은다.
 *
 * 걸음 경계는 메커니즘이 정한다. reactive 는 `emit` 에 지연이 없어 경계가 `sleep` 과 입력 대기뿐이고,
 * coroutine 은 silent 가 아닌 발신 하나하나가 경계다 (S-runtime 의 silent 규약). 경계에서 켜져 있던
 * phase 가 코드 패널에 실제로 머무는 줄이다.
 */
async function drive(facet: FacetJson, inputs: Input[], reactive: boolean): Promise<Round[]> {
  const run = getAlgorithm(stripPrefix(facet.algorithm, 'module'));
  if (!run) throw new Error(`알고리즘 미등록: ${facet.algorithm}`);
  const rounds: Round[] = [];
  const totals = new Map<string, number>();
  let current: Round = { events: [], metrics: totals, lit: new Set(), input: '첫 판' };
  let lastPhase: string | null = null;
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const waiting = new Promise<void>((r) => (idle = r));
  const close = (): void => {
    if (lastPhase) current.lit.add(lastPhase);
    rounds.push({ ...current, metrics: new Map(totals) });
  };
  const ctx = {
    data: clone(facet.initialData),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc'): void {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      current.events.push({ type: '__metric', payload: { name } });
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      current.events.push(event);
      const p = event.payload as { phase?: unknown } | undefined;
      if (event.type === 'phase' && typeof p?.phase === 'string') lastPhase = p.phase;
      else if (!reactive && event.silent !== true && lastPhase) current.lit.add(lastPhase);
    },
    async sleep(): Promise<boolean> {
      if (lastPhase) current.lit.add(lastPhase);
      return !cancelled;
    },
    async waitForInput(): Promise<Input> {
      close();
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      current = { events: [], metrics: totals, lit: new Set(), input: `${next.type}=${String(next.payload.value)}` };
      return next;
    },
    pollInput(): null {
      return null;
    },
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('알고리즘이 20 초 안에 입력 대기에 닿지 않았다 — sleep 없이 도는 루프?')), 20_000);
  });
  try {
    await Promise.race([run(ctx as never).then(() => close()), waiting, cap]);
  } finally {
    clearTimeout(timer);
    cancelled = true;
  }
  return rounds;
}

const names = FACET_ONLY;

describe.skipIf(names.length === 0)('완제품 자체 검증', () => {
  for (const name of names) {
    it(`${name} — 손잡이 · phase · 계기 · IR`, async () => {
      const facet = await load(name);
      if (!facet) return; // 장면 조각 — piece-self-check 의 몫
      const algoName = stripPrefix(facet.algorithm, 'module');
      const knobs = knobsOf(facet);
      const problems: string[] = [];

      // ── 손잡이
      if (knobs.length > 0 && getAlgorithmMechanismKind(algoName) !== 'reactive') {
        problems.push(
          "손잡이(segmented-slider)가 있는데 mechanismKind 가 'reactive' 가 아니다 — index.ts 의 registerAlgorithm 옵션에 적는다. coroutine 이면 마운트에서 throw 한다",
        );
      }
      for (const k of knobs) {
        if (!k.values.includes(k.initial)) problems.push(`손잡이 ${k.action} 의 기본값 ${k.initial} 이 segments 에 없다`);
      }

      const { inputs, backRounds } = planOf(knobs);
      const reactive = getAlgorithmMechanismKind(algoName) === 'reactive';
      const rounds = await drive(facet, inputs, reactive);
      expect(rounds.length, '첫 판이 끝나지 않았다').toBeGreaterThan(0);
      const first = rounds[0]!;
      expect(first.events.length, '첫 판에 발신이 없다').toBeGreaterThan(0);
      for (let i = 1; i < rounds.length; i += 1) {
        if (rounds[i]!.events.length === 0) problems.push(`손잡이가 알고리즘에 닿지 않는다 — ${rounds[i]!.input} 뒤 발신도 계기도 없다`);
      }

      // ── phase
      const irs = irsOf(facet);
      if (irs.length > 0) {
        const irPhases = new Set<string>();
        for (const ir of irs) for (const fn of ir.functions) walk(fn.body, (s) => {
          if ('phase' in s && typeof s.phase === 'string') irPhases.add(s.phase);
        });
        const sent = new Set<string>();
        const lit = new Set<string>();
        for (const r of rounds) {
          for (const e of r.events) {
            const p = e.payload as { phase?: unknown } | undefined;
            if (e.type === 'phase' && typeof p?.phase === 'string') sent.add(p.phase);
          }
          for (const p of r.lit) lit.add(p);
        }
        // IR 에만 있는 phase 는 이 데이터가 그 갈래에 닿지 않았을 수 있어 여기서 판정하지 않는다 (C3 의
        // 정적 대조는 rule-guard 몫). 보냈는데 IR 에 없는 것은 데이터와 무관하게 틀렸다.
        const onlyAlgo = [...sent].filter((p) => !irPhases.has(p));
        if (onlyAlgo.length > 0) problems.push(`C3 IR 에 없는 phase 를 보낸다: [${onlyAlgo.join(', ')}]`);
        const unreached = [...irPhases].filter((p) => !sent.has(p));
        if (unreached.length > 0 && knobs.length > 0) {
          problems.push(`IR 의 phase [${unreached.join(', ')}] 가 손잡이를 모두 돌려도 한 번도 오지 않는다 — 코드 패널에 끝내 안 켜지는 줄이다`);
        }
        const covered = [...irPhases].filter((p) => sent.has(p) && !lit.has(p));
        if (covered.length > 0) {
          problems.push(
            `덮이는 phase [${covered.join(', ')}] — 보내기는 하지만 걸음 경계(sleep · 입력 대기)에 한 번도 켜져 있지 않아 코드 패널에서 그 줄이 끝내 안 켜진다. 그 phase 뒤에 걸음 경계를 둔다`,
          );
        }
      }

      // ── 계기
      const declared = new Set(declaredMetrics(facet));
      const sentMetrics = new Set<string>();
      for (const r of rounds) for (const e of r.events) if (e.type === '__metric') sentMetrics.add(String((e.payload as { name: string }).name));
      const undeclared = [...sentMetrics].filter((m) => !declared.has(m));
      if (undeclared.length > 0) problems.push(`C5 선언하지 않은 계기를 보낸다: ${undeclared.join(', ')}`);
      const firstNames = new Set(first.events.filter((e) => e.type === '__metric').map((e) => String((e.payload as { name: string }).name)));
      const silentDecl = [...declared].filter((m) => !firstNames.has(m));
      // 손잡이를 두는 완제품에서만 — 판을 다시 돌 때 갈리지 않는 값이 이름째 빠지는 것이 이 조항의 까닭이다.
      if (silentDecl.length > 0 && knobs.length > 0) {
        problems.push(`첫 판에 실리지 않은 계기: ${silentDecl.join(', ')} — 델타가 0 이어도 처음 한 번은 보낸다 (안 보내면 선언한 계기가 빠진 것과 구별되지 않는다)`);
      }
      for (const back of backRounds) {
        const r = rounds[back];
        if (!r) continue;
        const drift = [...declared].filter((m) => (r.metrics.get(m) ?? 0) !== (first.metrics.get(m) ?? 0));
        if (drift.length > 0) {
          problems.push(
            `계기가 판마다 쌓인다 — 손잡이를 기본값으로 되돌린 판(${r.input})의 ${drift
              .map((m) => `${m} ${first.metrics.get(m) ?? 0} → ${r.metrics.get(m) ?? 0}`)
              .join(', ')}. ctx.metric 은 누적 채널이다 — 지금 값을 들고 차이만 보내는 헬퍼를 둔다`,
          );
        }
      }

      // ── IR
      for (const ir of irs) {
        for (const fn of ir.functions) walk(fn.body, (s) => {
          if (s.kind === 'comment' && /[가-힣]/.test(s.text)) problems.push(`IR 주석이 한국어다 — 코드 패널은 열 언어 화면에 그대로 띄운다. 영어로: "${s.text.slice(0, 40)}"`);
        });
        for (const t of TRANSPILERS) {
          try {
            const { lines } = t.transpile(ir);
            if (lines.length === 0) problems.push(`${ir.id} → ${t.language} 가 빈 코드를 냈다`);
          } catch (err) {
            problems.push(`${ir.id} → ${t.language} 가 옮기지 못했다: ${(err as Error).message}`);
          }
        }
      }

      expect(problems, problems.join('\n')).toEqual([]);
    }, 60_000);
  }
});
