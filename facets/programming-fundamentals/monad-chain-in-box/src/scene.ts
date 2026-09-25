/**
 * monad-chain-in-box 의 장면.
 *
 * 바탕 — 프로그램 줄(`lines`)과 상자를 받는 함수 이름(`fnName`). init 이 한 번 정한다.
 * 자취 — 이름마다 선 상자(`slots`, 줄 차례대로)와 출력(`output`). 걸음이 쌓는다.
 * 이번 걸음 — `step`. 무엇이 흐를지(담김 · 열려 넘어감 · 빈 채로 건너감 · 출력)만 말한다.
 *
 * 셈은 알고리즘이 했다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneBox = { kind: 'box'; v: number } | { kind: 'empty' };

export type SlotVia =
  | { kind: 'direct' }
  | { kind: 'call'; fromLine: number; n: number; condLine: number; cond: boolean }
  | { kind: 'skip'; fromLine: number };

export type Slot = { line: number; name: string; out: SceneBox; code: string; via: SlotVia };

export type MonadStep =
  | { kind: 'start' }
  | { kind: 'bind'; line: number }
  | { kind: 'call'; line: number; fromLine: number }
  | { kind: 'skip'; line: number; fromLine: number }
  | { kind: 'show'; line: number; fromLine: number };

export type MonadChainInBoxScene = {
  lines: { indent: number; text: string }[];
  fnName: string;
  /** 상자 칸이 설 줄 — 바탕 */
  slotLines: number[];
  slots: Slot[];
  output: { line: number; code: string; fromLine: number } | null;
  step: MonadStep | null;
};

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}
function numOf(v: unknown, fallback = -1): number {
  return typeof v === 'number' ? v : fallback;
}
function strOf(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function boxOf(v: unknown): SceneBox {
  const r = rec(v);
  if (r.kind === 'box' && typeof r.v === 'number') return { kind: 'box', v: r.v };
  return { kind: 'empty' };
}

function emptyScene(): MonadChainInBoxScene {
  return { lines: [], fnName: '', slotLines: [], slots: [], output: null, step: null };
}

export const monadChainInBoxScene: ScenePlan<MonadChainInBoxScene> = {
  initial(): MonadChainInBoxScene {
    return emptyScene();
  },

  reduce(scene: MonadChainInBoxScene, event: FacetRuntimeEvent): MonadChainInBoxScene {
    const p = rec(event.payload);
    switch (event.type) {
      case 'init': {
        const raw = Array.isArray(p.lines) ? p.lines : [];
        const lines = raw.map((l) => {
          const r = rec(l);
          return { indent: numOf(r.indent, 0), text: strOf(r.text) };
        });
        const slotLines = (Array.isArray(p.slotLines) ? p.slotLines : []).filter(
          (v): v is number => typeof v === 'number',
        );
        return {
          lines,
          fnName: strOf(p.fnName),
          slotLines,
          slots: [],
          output: null,
          step: { kind: 'start' },
        };
      }
      case 'bind': {
        const line = numOf(p.line);
        const slot: Slot = {
          line,
          name: strOf(p.name),
          out: boxOf(p.out),
          code: strOf(p.code),
          via: { kind: 'direct' },
        };
        return { ...scene, slots: [...scene.slots, slot], step: { kind: 'bind', line } };
      }
      case 'thenCall': {
        const line = numOf(p.line);
        const fromLine = numOf(p.fromLine);
        const slot: Slot = {
          line,
          name: strOf(p.name),
          out: boxOf(p.out),
          code: strOf(p.code),
          via: {
            kind: 'call',
            fromLine,
            n: numOf(p.n, 0),
            condLine: numOf(p.condLine),
            cond: p.cond === true,
          },
        };
        return { ...scene, slots: [...scene.slots, slot], step: { kind: 'call', line, fromLine } };
      }
      case 'thenSkip': {
        const line = numOf(p.line);
        const fromLine = numOf(p.fromLine);
        const slot: Slot = {
          line,
          name: strOf(p.name),
          out: boxOf(p.out),
          code: strOf(p.code),
          via: { kind: 'skip', fromLine },
        };
        return { ...scene, slots: [...scene.slots, slot], step: { kind: 'skip', line, fromLine } };
      }
      case 'show': {
        const line = numOf(p.line);
        const fromLine = numOf(p.fromLine);
        return {
          ...scene,
          output: { line, code: strOf(p.code), fromLine },
          step: { kind: 'show', line, fromLine },
        };
      }
      default:
        return scene;
    }
  },
};
