/**
 * inlining-tradeoff projector — algorithm 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 *   round-start → 코드 패널 강조를 끄고 무대를 원래 프로그램으로 (앞 판의 붙인 몸이 부르는 줄로 접힌다)
 *   judge       → 한계와 견준 함수 하나 — 부르는 줄들이 열리거나 그대로 남는다
 *   total       → 셈 캡션
 *   phase       → 코드 패널 highlightPhase
 *
 * payload 는 typeof 로 좁히고, 비거나 모양이 다르면 던진다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { DefLine, MainLine } from './algorithm.js';
import type { InliningTradeoffStage, JudgeView, RoundStartView, TotalView } from './inlining-tradeoff-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

/** 운동 길이 — 재생 속도를 그때그때 읽는다 */
const MOTION_MS = 900;

type Obj = Record<string, unknown>;

function obj(x: unknown, what: string): Obj {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`inlining-tradeoff: ${what} 이 객체가 아니다`);
  return x as Obj;
}
function num(o: Obj, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`inlining-tradeoff: payload.${k} 이 수가 아니다`);
  return v;
}
function str(o: Obj, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`inlining-tradeoff: payload.${k} 이 글자가 아니다`);
  return v;
}
function bool(o: Obj, k: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') throw new Error(`inlining-tradeoff: payload.${k} 이 참거짓이 아니다`);
  return v;
}
function arr(o: Obj, k: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`inlining-tradeoff: payload.${k} 이 목록이 아니다`);
  return v;
}

const KINDS = ['call', 'op', 'return', 'pasted'] as const;

function mainLines(o: Obj): MainLine[] {
  return arr(o, 'main').map((x) => {
    const l = obj(x, 'main 줄');
    const kind = str(l, 'kind');
    const k = KINDS.find((c) => c === kind);
    if (k === undefined) throw new Error(`inlining-tradeoff: 모르는 줄 종류 ${kind}`);
    return { key: str(l, 'key'), text: str(l, 'text'), kind: k, origin: num(l, 'origin'), src: num(l, 'src'), site: str(l, 'site') };
  });
}

function defLines(o: Obj): DefLine[] {
  return arr(o, 'defs').map((x) => {
    const d = obj(x, '정의 줄');
    return { text: str(d, 'text'), origin: num(d, 'origin'), header: bool(d, 'header') };
  });
}

function numbers(o: Obj, k: string): number[] {
  return arr(o, k).map((v) => {
    if (typeof v !== 'number') throw new Error(`inlining-tradeoff: payload.${k} 에 수가 아닌 것`);
    return v;
  });
}

function strings(o: Obj, k: string): string[] {
  return arr(o, k).map((v) => {
    if (typeof v !== 'string') throw new Error(`inlining-tradeoff: payload.${k} 에 글자가 아닌 것`);
    return v;
  });
}

function readStart(p: unknown): RoundStartView {
  const o = obj(p, 'round-start payload');
  return {
    limit: num(o, 'limit'),
    ladder: numbers(o, 'ladder'),
    gaugeMax: num(o, 'gaugeMax'),
    scaleMax: num(o, 'scaleMax'),
    defs: defLines(o),
    mainHeader: str(o, 'mainHeader'),
    main: mainLines(o),
    bodies: arr(o, 'bodies').map((x) => {
      const b = obj(x, '피호출');
      return { name: str(b, 'name'), ops: num(b, 'ops') };
    }),
    size: num(o, 'size'),
    exec: num(o, 'exec'),
  };
}

function readJudge(p: unknown): JudgeView {
  const o = obj(p, 'judge payload');
  return {
    fn: str(o, 'fn'),
    index: num(o, 'index'),
    ops: num(o, 'ops'),
    limit: num(o, 'limit'),
    pasted: bool(o, 'pasted'),
    sites: num(o, 'sites'),
    siteKeys: strings(o, 'siteKeys'),
    main: mainLines(o),
    size: num(o, 'size'),
    exec: num(o, 'exec'),
    dSize: num(o, 'dSize'),
    dExec: num(o, 'dExec'),
  };
}

function readTotal(p: unknown): TotalView {
  const o = obj(p, 'total payload');
  return { size: num(o, 'size'), exec: num(o, 'exec'), pasted: num(o, 'pasted'), mainLen: num(o, 'mainLen') };
}

export const inliningTradeoffProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as InliningTradeoffStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motionMs = (): number => {
    const speed = runtime ? runtime.getSpeed() : 1;
    return speed > 0 ? MOTION_MS / speed : 0;
  };

  return {
    onInit() {
      stage?.reset();
    },
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const phase = str(obj(event.payload, 'phase payload'), 'phase');
          code?.highlightPhase(phase);
          return;
        }
        case 'round-start':
          code?.highlightPhase(null);
          stage?.startRound(readStart(event.payload), motionMs());
          return;
        case 'judge':
          stage?.judge(readJudge(event.payload), motionMs());
          return;
        case 'total':
          stage?.total(readTotal(event.payload));
          return;
        default:
          throw new Error(`inlining-tradeoff: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      code?.clearHighlight();
      stage?.reset();
    },
  };
};
