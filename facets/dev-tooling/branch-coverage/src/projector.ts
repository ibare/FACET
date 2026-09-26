/**
 * branchCoverage projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 빠진 필드는 이벤트 이름 · 필드 경로를 담아 던진다 (C6 · C9).
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 를 다시 읽어 정한다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type {
  BranchCoverageStage,
  MeterView,
  MetersView,
  RoundStartView,
  StepLineView,
  VerdictView,
} from './branch-coverage-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void };

type Obj = Record<string, unknown>;

function obj(v: unknown, where: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`[branchCoverageProjector] ${where}: 객체가 아니다`);
  return v as Obj;
}
function num(o: Obj, k: string, where: string): number {
  const v = o[k];
  if (typeof v !== 'number') throw new Error(`[branchCoverageProjector] ${where}.${k}: 수가 아니다`);
  return v;
}
function str(o: Obj, k: string, where: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`[branchCoverageProjector] ${where}.${k}: 글자가 아니다`);
  return v;
}
function bool(o: Obj, k: string, where: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') throw new Error(`[branchCoverageProjector] ${where}.${k}: 참거짓이 아니다`);
  return v;
}
function arr(o: Obj, k: string, where: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`[branchCoverageProjector] ${where}.${k}: 목록이 아니다`);
  return v;
}

function meter(v: unknown, where: string): MeterView {
  const o = obj(v, where);
  return { hit: num(o, 'hit', where), total: num(o, 'total', where), full: bool(o, 'full', where) };
}
function meters(o: Obj, where: string): MetersView {
  const m = obj(o.meters, `${where}.meters`);
  return {
    lines: meter(m.lines, `${where}.meters.lines`),
    branches: meter(m.branches, `${where}.meters.branches`),
    pairs: meter(m.pairs, `${where}.meters.pairs`),
    mutants: meter(m.mutants, `${where}.meters.mutants`),
  };
}

function readRoundStart(payload: unknown): RoundStartView {
  const w = 'round-start';
  const o = obj(payload, w);
  return {
    testCount: num(o, 'testCount', w),
    motionMs: num(o, 'motionMs', w),
    fnName: str(o, 'fnName', w),
    lines: arr(o, 'lines', w).map((x, i) => {
      const l = obj(x, `${w}.lines[${i}]`);
      return { no: num(l, 'no', `${w}.lines[${i}]`), text: str(l, 'text', `${w}.lines[${i}]`) };
    }),
    decisionLine: num(o, 'decisionLine', w),
    conditions: arr(o, 'conditions', w).map((x, i) => {
      const c = obj(x, `${w}.conditions[${i}]`);
      return { id: str(c, 'id', `${w}.conditions[${i}]`), text: str(c, 'text', `${w}.conditions[${i}]`) };
    }),
    tests: arr(o, 'tests', w).map((x, i) => {
      const at = `${w}.tests[${i}]`;
      const tc = obj(x, at);
      const args = arr(tc, 'args', at).map((a, j) => {
        if (typeof a !== 'number' && typeof a !== 'boolean') throw new Error(`[branchCoverageProjector] ${at}.args[${j}]: 모르는 모양`);
        return a;
      });
      return { id: str(tc, 'id', at), args, expect: num(tc, 'expect', at), active: bool(tc, 'active', at) };
    }),
    mutants: arr(o, 'mutants', w).map((x, i) => {
      const at = `${w}.mutants[${i}]`;
      const m = obj(x, at);
      return { id: str(m, 'id', at), line: num(m, 'line', at), text: str(m, 'text', at) };
    }),
    meters: meters(o, w),
  };
}

function readStepLine(payload: unknown): StepLineView {
  const w = 'step-line';
  const o = obj(payload, w);
  const d = o.decision;
  if (d !== null && typeof d !== 'boolean') throw new Error(`[branchCoverageProjector] ${w}.decision: 모르는 모양`);
  const cvRaw = o.conditionValues;
  let conditionValues: StepLineView['conditionValues'] = null;
  if (cvRaw !== null) {
    if (!Array.isArray(cvRaw)) throw new Error(`[branchCoverageProjector] ${w}.conditionValues: 목록이 아니다`);
    conditionValues = cvRaw.map((x, i) => {
      const c = obj(x, `${w}.conditionValues[${i}]`);
      return { id: str(c, 'id', `${w}.conditionValues[${i}]`), value: bool(c, 'value', `${w}.conditionValues[${i}]`) };
    });
  }
  return {
    test: str(o, 'test', w),
    testIndex: num(o, 'testIndex', w),
    line: num(o, 'line', w),
    f: num(o, 'f', w),
    decision: d,
    conditionValues,
    meters: meters(o, w),
  };
}

function readVerdict(payload: unknown): VerdictView {
  const w = 'verdict';
  const o = obj(payload, w);
  if (!bool(o, 'passed', w)) throw new Error(`[branchCoverageProjector] ${w}.passed: 원본이 떨어진 판정은 오지 않는다`);
  return {
    test: str(o, 'test', w),
    testIndex: num(o, 'testIndex', w),
    result: num(o, 'result', w),
    killed: arr(o, 'killed', w).map((x, i) => {
      if (typeof x !== 'string') throw new Error(`[branchCoverageProjector] ${w}.killed[${i}]: 글자가 아니다`);
      return x;
    }),
    pairs: arr(o, 'pairs', w).map((x, i) => {
      const at = `${w}.pairs[${i}]`;
      const p = obj(x, at);
      const raw = p.pair;
      let pair: [string, string] | null = null;
      if (raw !== null) {
        if (!Array.isArray(raw) || raw.length !== 2 || typeof raw[0] !== 'string' || typeof raw[1] !== 'string') {
          throw new Error(`[branchCoverageProjector] ${at}.pair: 모르는 모양`);
        }
        pair = [raw[0], raw[1]];
      }
      return { condition: str(p, 'condition', at), pair };
    }),
    meters: meters(o, w),
  };
}

export const branchCoverageProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BranchCoverageStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  // 운동 길이(재생 속도 1 에서)는 initialData.motionMs — round-start 가 실어 온다
  let baseMotionMs: number | null = null;
  const motionMs = (): number => {
    if (baseMotionMs === null) throw new Error('[branchCoverageProjector] round-start 전에 운동 길이를 모른다');
    const speed = runtime?.getSpeed() ?? 1;
    if (!(speed > 0)) throw new Error('[branchCoverageProjector] 재생 속도가 0 이하');
    return Math.round(baseMotionMs / speed);
  };
  const needStage = (): BranchCoverageStage => {
    if (!stage) throw new Error('[branchCoverageProjector] stage 가 없다');
    return stage;
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase');
          code?.highlightPhase?.(str(p, 'phase', 'phase'));
          return;
        }
        case 'round-start': {
          code?.highlightPhase?.(null);
          const p = readRoundStart(event.payload);
          baseMotionMs = p.motionMs;
          needStage().roundStart(p, motionMs());
          return;
        }
        case 'step-line':
          needStage().stepLine(readStepLine(event.payload), motionMs());
          return;
        case 'verdict':
          needStage().verdict(readVerdict(event.payload), motionMs());
          return;
        default:
          throw new Error(`[branchCoverageProjector] 모르는 이벤트: ${event.type}`);
      }
    },
  };
};
