/**
 * timestamp-vs-fingerprint 의 장면.
 *
 * 바탕  규칙 · 소스(내용) · 적어 둔 지문 — initial() 이 initialData 에서 한 번 정한다.
 * 자취  두 쪽이 지금 쥔 값(시각 쪽의 시각, 지문 쪽의 소스 지문) · 저장했는가 · 판정한 대상들.
 * 이번  step — 저장이거나 대상 하나의 판정.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  fingerprint,
  parseTime,
  recordedPrints,
  type BuildRule,
  type SourceFile,
} from './algorithm.js';

export type TimeInput = { name: string; at: number };
export type PrintSource = { name: string; now: string; recorded: string };

export type SaveStep = {
  kind: 'save';
  file: string;
  was: number;
  at: number;
  printWas: string;
  printNow: string;
};

export type JudgeStep = {
  kind: 'judge';
  target: string;
  time: { inputs: TimeInput[]; targetWas: number; later: string[]; rebuilt: boolean; now: number };
  print: { sources: PrintSource[]; changed: string[]; rebuilt: boolean };
};

export type Verdict = {
  target: string;
  timeRebuilt: boolean;
  /** 시각 쪽에서 대상을 넘게 한 입력들 */
  timeLater: string[];
  printRebuilt: boolean;
};

export type TimestampVsFingerprintScene = {
  rules: BuildRule[];
  sources: SourceFile[];
  /** 대상마다 지난 빌드 때 적어 둔 소스 입력의 지문 */
  recorded: { target: string; input: string; print: string }[];
  /** 시각 쪽이 지금 쥔 시각 (분). 차례는 소스 · 대상 순 */
  times: TimeInput[];
  /** 지문 쪽이 지금 쥔 소스 지문 */
  prints: { name: string; print: string }[];
  /** 저장 사건 — 일어났으면 무엇을 언제 */
  saved: { file: string; at: number } | null;
  judged: Verdict[];
  step: SaveStep | JudgeStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string') throw new Error(`글자가 아니다: ${where}`);
  return v;
}

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`수가 아니다: ${where}`);
  return v;
}

function bool(v: unknown, where: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`참거짓이 아니다: ${where}`);
  return v;
}

function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`목록이 아니다: ${where}`);
  return v;
}

function rec(v: unknown, where: string): Record<string, unknown> {
  if (!isRecord(v)) throw new Error(`묶음이 아니다: ${where}`);
  return v;
}

function readRules(v: unknown): BuildRule[] {
  return arr(v, 'rules').map((r, n) => {
    const o = rec(r, `rules[${n}]`);
    return {
      target: str(o.target, `rules[${n}].target`),
      inputs: arr(o.inputs, `rules[${n}].inputs`).map((i, k) => str(i, `rules[${n}].inputs[${k}]`)),
    };
  });
}

function readSources(v: unknown): SourceFile[] {
  return arr(v, 'sources').map((s, n) => {
    const o = rec(s, `sources[${n}]`);
    return { name: str(o.name, `sources[${n}].name`), content: str(o.content, `sources[${n}].content`) };
  });
}

function readJudge(p: Record<string, unknown>): JudgeStep {
  const time = rec(p.time, 'judge.time');
  const print = rec(p.print, 'judge.print');
  return {
    kind: 'judge',
    target: str(p.target, 'judge.target'),
    time: {
      inputs: arr(time.inputs, 'judge.time.inputs').map((i, n) => {
        const o = rec(i, `judge.time.inputs[${n}]`);
        return { name: str(o.name, 'input.name'), at: num(o.at, 'input.at') };
      }),
      targetWas: num(time.targetWas, 'judge.time.targetWas'),
      later: arr(time.later, 'judge.time.later').map((l, n) => str(l, `judge.time.later[${n}]`)),
      rebuilt: bool(time.rebuilt, 'judge.time.rebuilt'),
      now: num(time.now, 'judge.time.now'),
    },
    print: {
      sources: arr(print.sources, 'judge.print.sources').map((s, n) => {
        const o = rec(s, `judge.print.sources[${n}]`);
        return {
          name: str(o.name, 'source.name'),
          now: str(o.now, 'source.now'),
          recorded: str(o.recorded, 'source.recorded'),
        };
      }),
      changed: arr(print.changed, 'judge.print.changed').map((c, n) => str(c, `judge.print.changed[${n}]`)),
      rebuilt: bool(print.rebuilt, 'judge.print.rebuilt'),
    },
  };
}

export const timestampVsFingerprintScene: ScenePlan<TimestampVsFingerprintScene> = {
  initial(initialData: unknown): TimestampVsFingerprintScene {
    const d = rec(initialData, 'initialData');
    const rules = readRules(d.rules);
    const sources = readSources(d.sources);
    const given = new Map<string, number>();
    for (const [n, f] of arr(d.times, 'times').entries()) {
      const o = rec(f, `times[${n}]`);
      given.set(str(o.name, `times[${n}].name`), parseTime(str(o.at, `times[${n}].at`)));
    }
    const names = [...sources.map((s) => s.name), ...rules.map((r) => r.target)];
    const times = names.map((name) => {
      const at = given.get(name);
      if (at === undefined) throw new Error(`시각이 없다: ${name}`);
      return { name, at };
    });
    const recorded: TimestampVsFingerprintScene['recorded'] = [];
    for (const [target, m] of recordedPrints(rules, sources)) {
      for (const [input, print] of m) recorded.push({ target, input, print });
    }
    return {
      rules,
      sources,
      recorded,
      times,
      prints: sources.map((s) => ({ name: s.name, print: fingerprint(s.content) })),
      saved: null,
      judged: [],
      step: null,
    };
  },

  reduce(scene: TimestampVsFingerprintScene, event: FacetRuntimeEvent): TimestampVsFingerprintScene {
    const p = rec(event.payload, `${event.type}.payload`);
    if (event.type === 'save') {
      const step: SaveStep = {
        kind: 'save',
        file: str(p.file, 'save.file'),
        was: num(p.was, 'save.was'),
        at: num(p.at, 'save.at'),
        printWas: str(p.printWas, 'save.printWas'),
        printNow: str(p.printNow, 'save.printNow'),
      };
      if (!scene.times.some((t) => t.name === step.file)) throw new Error(`모르는 소스: ${step.file}`);
      return {
        ...scene,
        times: scene.times.map((t) => (t.name === step.file ? { name: t.name, at: step.at } : t)),
        prints: scene.prints.map((f) => (f.name === step.file ? { name: f.name, print: step.printNow } : f)),
        saved: { file: step.file, at: step.at },
        step,
      };
    }
    if (event.type === 'judge') {
      const step = readJudge(p);
      if (!scene.times.some((t) => t.name === step.target)) throw new Error(`모르는 대상: ${step.target}`);
      return {
        ...scene,
        times: scene.times.map((t) => (t.name === step.target ? { name: t.name, at: step.time.now } : t)),
        judged: [
          ...scene.judged,
          {
            target: step.target,
            timeRebuilt: step.time.rebuilt,
            timeLater: [...step.time.later],
            printRebuilt: step.print.rebuilt,
          },
        ],
        step,
      };
    }
    throw new Error(`모르는 이벤트: ${event.type}`);
  },
};
