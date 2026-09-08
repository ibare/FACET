/**
 * memoWriteOnce 의 Projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 `unknown` 이므로 좁은 인라인 단언 + 런타임 가드로 정형 객체를 만든
 * 뒤에야 stage 로 넘긴다 (C9). 캡션 문안은 여기서 `tr` 로 해석한다 — algorithm 은
 * 키도 문장도 보내지 않고, 무엇이라 말할지는 표현 계층이 정한다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';

type MemoStage = {
  branch?(spec: {
    id: string;
    n: number;
    depth: number;
    parentId: string | null;
    side: 'root' | 'L' | 'R';
  }): Promise<void> | void;
  writeToMemo?(id: string, n: number, value: number): Promise<void> | void;
  readFromMemo?(id: string, n: number, value: number): Promise<void> | void;
  finish?(): Promise<void> | void;
  setCaption?(text: string): void;
  clear?(): void;
};

type BranchPayload = {
  id: string;
  n: number;
  depth: number;
  parentId: string | null;
  side: 'root' | 'L' | 'R';
};

type ValuePayload = { id: string; n: number; value: number };

type DonePayload = { n: number; value: number; solved: number; reused: number };

function readBranch(payload: unknown): BranchPayload | null {
  const p = payload as
    | { id?: unknown; n?: unknown; depth?: unknown; parentId?: unknown; side?: unknown }
    | undefined;
  if (typeof p?.id !== 'string') return null;
  if (typeof p.n !== 'number' || typeof p.depth !== 'number') return null;
  const parentId = typeof p.parentId === 'string' ? p.parentId : null;
  const side = p.side === 'L' || p.side === 'R' ? p.side : 'root';
  return { id: p.id, n: p.n, depth: p.depth, parentId, side };
}

function readValue(payload: unknown): ValuePayload | null {
  const p = payload as { id?: unknown; n?: unknown; value?: unknown } | undefined;
  if (typeof p?.id !== 'string') return null;
  if (typeof p.n !== 'number' || typeof p.value !== 'number') return null;
  return { id: p.id, n: p.n, value: p.value };
}

function readDone(payload: unknown): DonePayload | null {
  const p = payload as
    | { n?: unknown; value?: unknown; solved?: unknown; reused?: unknown }
    | undefined;
  if (typeof p?.n !== 'number' || typeof p.value !== 'number') return null;
  if (typeof p.solved !== 'number' || typeof p.reused !== 'number') return null;
  return { n: p.n, value: p.value, solved: p.solved, reused: p.reused };
}

export const memoWriteOnceProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as MemoStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(): void {
      stage?.clear?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'branch': {
          const p = readBranch(event.payload);
          if (!p) return;
          stage?.setCaption?.(tr('caption.call', 'Call f({n}).', { n: p.n }));
          await stage?.branch?.(p);
          return;
        }

        case 'resolve': {
          const p = readValue(event.payload);
          if (!p) return;
          stage?.setCaption?.(
            tr('caption.write', 'f({n}) = {value}. Write it into memo[{n}].', {
              n: p.n,
              value: p.value,
            }),
          );
          await stage?.writeToMemo?.(p.id, p.n, p.value);
          return;
        }

        case 'read': {
          const p = readValue(event.payload);
          if (!p) return;
          stage?.setCaption?.(
            tr('caption.read', 'f({n}) is already written — read {value}, branch no further.', {
              n: p.n,
              value: p.value,
            }),
          );
          await stage?.readFromMemo?.(p.id, p.n, p.value);
          return;
        }

        case 'done': {
          const p = readDone(event.payload);
          if (!p) return;
          stage?.setCaption?.(
            tr(
              'caption.done',
              '{solved} terms solved, {reused} read back from memo. f({n}) = {value}.',
              { solved: p.solved, reused: p.reused, n: p.n, value: p.value },
            ),
          );
          await stage?.finish?.();
          return;
        }

        case 'rewind': {
          stage?.clear?.();
          return;
        }

        // 위 다섯 외의 이벤트는 이 facet 이 발신하지 않는다. 들어오면 조용히 버린다.
        default:
          return;
      }
    },

    onReset(): void {
      stage?.clear?.();
    },
  };
};
