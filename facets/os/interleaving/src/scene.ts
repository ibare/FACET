/**
 * interleaving 장면 — 알고리즘의 `round` 이벤트를 잇는다. 셈을 다시 돌리지 않는다.
 *
 * - 바탕: 두 스레드의 프로그램 (initialData 에서 베낌)
 * - 자취: 지금까지 낸 판들 (`rounds`), 끝났으면 요약 (`summary`)
 * - 이번 걸음: 새 판과 그 앞 판 (`from` — 스레드 줄이 옮겨 가기 전 자리를 말하는 계기값)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneThread = { id: string; lines: string[] };
export type SceneSlot = { thread: number; line: number; output: string };
export type SceneRound = { index: number; slots: SceneSlot[]; switches: number };
export type SceneSummary = { merges: number; arrangements: number };

export type InterleavingScene = {
  threads: SceneThread[];
  rounds: SceneRound[];
  summary: SceneSummary | null;
  step: { kind: 'round'; round: SceneRound; from: SceneRound | null } | null;
};

function readThreads(initialData: unknown): SceneThread[] {
  if (typeof initialData !== 'object' || initialData === null) return [];
  const raw = (initialData as { threads?: unknown }).threads;
  if (!Array.isArray(raw)) return [];
  const out: SceneThread[] = [];
  for (const th of raw) {
    if (typeof th !== 'object' || th === null) throw new Error('interleavingScene: 스레드 모양이 아니다');
    const id = (th as { id?: unknown }).id;
    const lines = (th as { lines?: unknown }).lines;
    if (typeof id !== 'string' || !Array.isArray(lines)) {
      throw new Error('interleavingScene: 스레드에 id · lines 가 없다');
    }
    const copy: string[] = [];
    for (const l of lines) {
      if (typeof l !== 'string') throw new Error(`interleavingScene: 스레드 ${id} 의 줄이 글자가 아니다`);
      copy.push(l);
    }
    out.push({ id, lines: copy });
  }
  return out;
}

function readSlot(v: unknown): SceneSlot {
  if (typeof v !== 'object' || v === null) throw new Error('interleavingScene: 자리 모양이 아니다');
  const thread = (v as { thread?: unknown }).thread;
  const line = (v as { line?: unknown }).line;
  const output = (v as { output?: unknown }).output;
  if (typeof thread !== 'number' || typeof line !== 'number' || typeof output !== 'string') {
    throw new Error('interleavingScene: 자리에 thread · line · output 이 없다');
  }
  return { thread, line, output };
}

function readSummary(v: unknown): SceneSummary | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') throw new Error('interleavingScene: summary 모양이 아니다');
  const merges = (v as { merges?: unknown }).merges;
  const arrangements = (v as { arrangements?: unknown }).arrangements;
  if (typeof merges !== 'number' || typeof arrangements !== 'number') {
    throw new Error('interleavingScene: summary 에 merges · arrangements 가 없다');
  }
  return { merges, arrangements };
}

export const interleavingScene: ScenePlan<InterleavingScene> = {
  initial(initialData: unknown): InterleavingScene {
    return { threads: readThreads(initialData), rounds: [], summary: null, step: null };
  },
  reduce(scene: InterleavingScene, event: FacetRuntimeEvent): InterleavingScene {
    if (event.type !== 'round') return scene;
    const p = event.payload;
    if (typeof p !== 'object' || p === null) throw new Error('interleavingScene: round payload 가 없다');
    const index = (p as { index?: unknown }).index;
    const slots = (p as { slots?: unknown }).slots;
    const switches = (p as { switches?: unknown }).switches;
    if (typeof index !== 'number' || !Array.isArray(slots) || typeof switches !== 'number') {
      throw new Error('interleavingScene: round payload 에 index · slots · switches 가 없다');
    }
    const round: SceneRound = { index, slots: slots.map(readSlot), switches };
    const from = scene.rounds.length > 0 ? scene.rounds[scene.rounds.length - 1] ?? null : null;
    return {
      threads: scene.threads,
      rounds: [...scene.rounds, round],
      summary: readSummary((p as { summary?: unknown }).summary),
      step: { kind: 'round', round, from },
    };
  },
};
