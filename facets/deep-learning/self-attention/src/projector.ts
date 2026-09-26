/**
 * self-attention projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * payload 는 `typeof` 가드로 읽고 어긋나면 던진다. 운동 길이는 재생 속도를 그때그때 읽어 정한다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';

type Pick = { keys: number[]; tied: boolean };

type Stage = {
  frame(
    p: { tokens: string[]; x: number[][]; heads: number; dk: number; sqrtDk: number; maxHeads: number },
    ms: number,
  ): void;
  project(p: { q: number[][]; k: number[][]; v: number[][] }): void;
  score(p: { raw: number[][][]; score: number[][][] }): void;
  softmax(p: { weights: number[][][]; topLow: number }, ms: number): void;
  pick(p: { picks: Pick[][]; clear: number; tied: number; rows: number }): void;
  mix(p: { result: number[][]; valueMax: number }, ms: number): void;
};

type CodePanel = { highlightPhase(phase: string | null): void };

/** 속도 1 에서 한 걸음의 운동 길이 (걸음 간격 안에서 끝난다). */
const MOTION_MS = 560;

function record(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`self-attention projector: ${what} payload 가 없다`);
  return v as Record<string, unknown>;
}
function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`self-attention projector: ${what} 가 수가 아니다`);
  return v;
}
function numList(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`self-attention projector: ${what} 가 목록이 아니다`);
  return v.map((x) => num(x, what));
}
function matrix(v: unknown, what: string): number[][] {
  if (!Array.isArray(v)) throw new Error(`self-attention projector: ${what} 가 행렬이 아니다`);
  return v.map((row) => numList(row, what));
}
function cube(v: unknown, what: string): number[][][] {
  if (!Array.isArray(v)) throw new Error(`self-attention projector: ${what} 가 머리 목록이 아니다`);
  return v.map((m) => matrix(m, what));
}
function strList(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`self-attention projector: ${what} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`self-attention projector: ${what} 에 글자 아닌 것이 있다`);
    return x;
  });
}
function picks(v: unknown): Pick[][] {
  if (!Array.isArray(v)) throw new Error('self-attention projector: picks 가 머리 목록이 아니다');
  return v.map((rows) => {
    if (!Array.isArray(rows)) throw new Error('self-attention projector: picks 의 줄 목록이 없다');
    return rows.map((row) => {
      const r = record(row, 'pick');
      if (typeof r.tied !== 'boolean') throw new Error('self-attention projector: pick.tied 가 참거짓이 아니다');
      return { keys: numList(r.keys, 'pick.keys'), tied: r.tied };
    });
  });
}

export const selfAttentionProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const motion = (): number => {
    const speed = runtime ? runtime.getSpeed() : 1;
    return MOTION_MS / Math.max(0.25, speed);
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = record(event.payload, 'phase');
          if (typeof p.phase !== 'string') throw new Error('self-attention projector: phase 이름이 없다');
          codePanel?.highlightPhase(p.phase);
          return;
        }
        case 'frame': {
          const p = record(event.payload, 'frame');
          codePanel?.highlightPhase(null);
          stage?.frame(
            {
              tokens: strList(p.tokens, 'tokens'),
              x: matrix(p.x, 'x'),
              heads: num(p.heads, 'heads'),
              dk: num(p.dk, 'dk'),
              sqrtDk: num(p.sqrtDk, 'sqrtDk'),
              maxHeads: num(p.maxHeads, 'maxHeads'),
            },
            motion(),
          );
          return;
        }
        case 'project': {
          const p = record(event.payload, 'project');
          stage?.project({ q: matrix(p.q, 'q'), k: matrix(p.k, 'k'), v: matrix(p.v, 'v') });
          return;
        }
        case 'score': {
          const p = record(event.payload, 'score');
          stage?.score({ raw: cube(p.raw, 'raw'), score: cube(p.score, 'score') });
          return;
        }
        case 'softmax': {
          const p = record(event.payload, 'softmax');
          stage?.softmax({ weights: cube(p.weights, 'weights'), topLow: num(p.topLow, 'topLow') }, motion());
          return;
        }
        case 'pick': {
          const p = record(event.payload, 'pick');
          stage?.pick({
            picks: picks(p.picks),
            clear: num(p.clear, 'clear'),
            tied: num(p.tied, 'tied'),
            rows: num(p.rows, 'rows'),
          });
          return;
        }
        case 'mix': {
          const p = record(event.payload, 'mix');
          stage?.mix({ result: matrix(p.result, 'result'), valueMax: num(p.valueMax, 'valueMax') }, motion());
          return;
        }
        default:
          throw new Error(`self-attention projector: 모르는 이벤트 ${event.type}`);
      }
    },
  };
};
