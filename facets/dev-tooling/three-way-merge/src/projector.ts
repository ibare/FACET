/**
 * three-way-merge projector — algorithm 이벤트를 무대 메서드로 옮긴다.
 *
 * 운동 길이는 `motionMs / 재생 속도` 를 부를 때마다 셈한다 (속도를 바꾸면 다음 걸음부터 따른다).
 * 무대는 셈하지 않으므로 손댄 줄 · 덩이 · 결과 줄을 payload 그대로 넘기고, 캡션에 넣을 줄 번호 글자만 여기서 짓는다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type {
  StageChunk,
  StageConflict,
  StageLine,
  StageSide,
  StageVerdict,
  ThreeWayMergeStage,
} from './three-way-merge-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

const VERDICTS: readonly StageVerdict[] = ['stable', 'ours', 'theirs', 'same', 'conflict'];
const ROLES: readonly StageLine['role'][] = ['line', 'marker', 'ours', 'theirs'];
const SIDES: readonly StageSide[] = ['base', 'ours', 'theirs'];

function fail(what: string): never {
  throw new Error(`threeWayMergeProjector: ${what}`);
}

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) fail(`${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string, what: string): number {
  const v = o[key];
  if (typeof v !== 'number') fail(`${what}.${key} 가 수가 아니다`);
  return v;
}

function nums(o: Record<string, unknown>, key: string, what: string): number[] {
  const v = o[key];
  if (!Array.isArray(v) || !v.every((x): x is number => typeof x === 'number')) fail(`${what}.${key} 가 수 배열이 아니다`);
  return v;
}

function strs(o: Record<string, unknown>, key: string, what: string): string[] {
  const v = o[key];
  if (!Array.isArray(v) || !v.every((x): x is string => typeof x === 'string')) fail(`${what}.${key} 가 글자 배열이 아니다`);
  return v;
}

function chunkOf(v: unknown): StageChunk {
  const o = rec(v, 'chunks[]');
  const verdict = o.verdict;
  if (typeof verdict !== 'string' || !(VERDICTS as readonly string[]).includes(verdict)) fail(`chunks[].verdict ${String(verdict)} 를 모른다`);
  return {
    verdict: verdict as StageVerdict,
    baseStart: num(o, 'baseStart', 'chunks[]'),
    baseEnd: num(o, 'baseEnd', 'chunks[]'),
    oursStart: num(o, 'oursStart', 'chunks[]'),
    oursEnd: num(o, 'oursEnd', 'chunks[]'),
    theirsStart: num(o, 'theirsStart', 'chunks[]'),
    theirsEnd: num(o, 'theirsEnd', 'chunks[]'),
  };
}

function lineOf(v: unknown): StageLine {
  const o = rec(v, 'lines[]');
  const { text, key, role, from } = o;
  if (typeof text !== 'string' || typeof key !== 'string') fail('lines[].text · key 가 글자가 아니다');
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) fail(`lines[].role ${String(role)} 를 모른다`);
  if (from !== null && (typeof from !== 'string' || !(SIDES as readonly string[]).includes(from))) {
    fail(`lines[].from ${String(from)} 를 모른다`);
  }
  return { text, key, role: role as StageLine['role'], from: from as StageSide | null, row: num(o, 'row', 'lines[]') };
}

/** 조상 줄 구간을 1 기반 글자로 — 빈 구간은 "5|6" (5 줄과 6 줄 사이). */
function spanText(c: StageChunk): string {
  if (c.baseEnd === c.baseStart) return `${c.baseStart}|${c.baseStart + 1}`;
  if (c.baseEnd - c.baseStart === 1) return String(c.baseStart + 1);
  return `${c.baseStart + 1}–${c.baseEnd}`;
}

export const threeWayMergeProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ThreeWayMergeStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  if (!stage) fail('views.stage 가 없다');
  let motionMs: number | null = null;
  let actions: string[] | null = null;
  let chunks: StageChunk[] = [];

  const motion = (): number => {
    if (motionMs === null) fail('onInit 전에 이벤트가 왔다 (motionMs 없음)');
    const speed = runtime ? runtime.getSpeed() : 1;
    return motionMs / Math.max(0.01, speed);
  };

  return {
    onInit(data: unknown) {
      const d = rec(data, 'initialData');
      motionMs = num(d, 'motionMs', 'initialData');
      actions = strs(d, 'oursActions', 'initialData');
      chunks = [];
    },
    onEvent(event) {
      const p = event.payload;
      switch (event.type) {
        case 'phase': {
          const phase = rec(p, 'phase').phase;
          if (typeof phase !== 'string') fail('phase.phase 가 글자가 아니다');
          code?.highlightPhase(phase);
          return;
        }
        case 'round': {
          const o = rec(p, 'round');
          if (!actions) fail('onInit 전에 round 가 왔다');
          const actIndex = num(o, 'act', 'round');
          const act = actions[actIndex];
          if (act !== 'edit' && act !== 'move') fail(`round.act ${actIndex} 의 손질 ${String(act)} 를 모른다`);
          let move: { first: number; last: number; below: number } | null = null;
          if (o.move !== null) {
            const m = rec(o.move, 'round.move');
            move = { first: num(m, 'first', 'round.move'), last: num(m, 'last', 'round.move'), below: num(m, 'below', 'round.move') };
          }
          chunks = [];
          code?.highlightPhase(null);
          stage.round(
            {
              act,
              line: num(o, 't', 'round'),
              base: strs(o, 'base', 'round'),
              ours: strs(o, 'ours', 'round'),
              theirs: strs(o, 'theirs', 'round'),
              theirsEdited: num(o, 'theirsEdited', 'round'),
              move,
            },
            motion(),
          );
          return;
        }
        case 'touched': {
          const o = rec(p, 'touched');
          stage.touched(
            {
              oursTouched: nums(o, 'oursTouched', 'touched'),
              theirsTouched: nums(o, 'theirsTouched', 'touched'),
              oursAdded: nums(o, 'oursAdded', 'touched'),
              theirsAdded: nums(o, 'theirsAdded', 'touched'),
              stable: nums(o, 'stable', 'touched'),
            },
            motion(),
          );
          return;
        }
        case 'chunks': {
          const list = rec(p, 'chunks').chunks;
          if (!Array.isArray(list)) fail('chunks.chunks 가 배열이 아니다');
          chunks = list.map(chunkOf);
          stage.chunks(chunks, motion());
          return;
        }
        case 'conflict': {
          const list = rec(p, 'conflict').blocks;
          if (!Array.isArray(list)) fail('conflict.blocks 가 배열이 아니다');
          const blocks: StageConflict[] = [];
          const spans: string[] = [];
          let oursLines = 0;
          let theirsLines = 0;
          for (const raw of list) {
            const b = rec(raw, 'conflict.blocks[]');
            const ci = num(b, 'chunk', 'conflict.blocks[]');
            const c = chunks[ci];
            if (!c || c.verdict !== 'conflict') fail(`conflict.blocks[].chunk ${ci} 가 충돌 덩이가 아니다`);
            const lines = b.lines;
            if (!Array.isArray(lines)) fail('conflict.blocks[].lines 가 배열이 아니다');
            blocks.push({ resultStart: num(b, 'resultStart', 'conflict.blocks[]'), lines: lines.map(lineOf) });
            spans.push(spanText(c));
            oursLines += c.oursEnd - c.oursStart;
            theirsLines += c.theirsEnd - c.theirsStart;
          }
          stage.conflict(blocks, spans.join(', '), oursLines, theirsLines, motion());
          return;
        }
        case 'result': {
          const o = rec(p, 'result');
          const lines = o.lines;
          if (!Array.isArray(lines)) fail('result.lines 가 배열이 아니다');
          stage.result(lines.map(lineOf), num(o, 'conflicts', 'result'), motion());
          return;
        }
        default:
          fail(`모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      chunks = [];
      stage.clear();
      code?.highlightPhase(null);
    },
    onDestroy() {
      chunks = [];
    },
  };
};
