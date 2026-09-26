import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowEditScriptData, type EditEntry, type EditOp, type EditScriptMarks } from './algorithm';

/** 이번 걸음. was* 는 걸음 앞의 읽은 줄 수 — 읽는 자리가 어디서 내려오는지. */
export type EditScriptStep =
  | { kind: 'start' }
  | { kind: 'write'; index: number; wasA: number; wasB: number }
  | { kind: 'readBack'; side: 'a' | 'b' };

export type EditScriptScene = {
  // 바탕
  a: string[];
  b: string[];
  marks: EditScriptMarks;
  // 자취
  entries: EditEntry[];
  readA: number;
  readB: number;
  /** 다시 읽은 쪽 — 고른 목록 줄의 자리. 아직이면 null. */
  backA: number[] | null;
  backB: number[] | null;
  // 이번 걸음
  step: EditScriptStep;
};

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`edit-script: ${event.type} 의 payload 가 없다`);
  return p as Record<string, unknown>;
}

function slot(v: unknown, path: string, limit: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= limit) {
    throw new Error(`edit-script: ${path} 가 자리 0..${limit - 1} 밖이다 (${String(v)})`);
  }
  return v;
}

function isOp(v: unknown): v is EditOp {
  return v === 'keep' || v === 'del' || v === 'ins';
}

export const editScriptScene: ScenePlan<EditScriptScene> = {
  initial(initialData: unknown): EditScriptScene {
    const d = narrowEditScriptData(initialData);
    return {
      a: [...d.a],
      b: [...d.b],
      marks: { ...d.marks },
      entries: [],
      readA: 0,
      readB: 0,
      backA: null,
      backB: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: EditScriptScene, event: FacetRuntimeEvent): EditScriptScene {
    if (event.type === 'write') {
      const p = payloadOf(event);
      if (!isOp(p.op)) throw new Error(`edit-script: write.payload.op 이 ${String(p.op)} 이다`);
      const op = p.op;
      const ai = op === 'ins' ? null : slot(p.ai, 'write.payload.ai', scene.a.length);
      const bi = op === 'del' ? null : slot(p.bi, 'write.payload.bi', scene.b.length);
      if (ai !== null && ai !== scene.readA) throw new Error(`edit-script: A 를 ${scene.readA} 에서 읽어야 하는데 ${ai} 가 왔다`);
      if (bi !== null && bi !== scene.readB) throw new Error(`edit-script: B 를 ${scene.readB} 에서 읽어야 하는데 ${bi} 가 왔다`);
      const entries = [...scene.entries.map((e) => ({ ...e })), { op, ai, bi }];
      return {
        ...scene,
        entries,
        readA: ai === null ? scene.readA : scene.readA + 1,
        readB: bi === null ? scene.readB : scene.readB + 1,
        step: { kind: 'write', index: entries.length - 1, wasA: scene.readA, wasB: scene.readB },
      };
    }
    if (event.type === 'readBack') {
      const p = payloadOf(event);
      if (p.side !== 'a' && p.side !== 'b') throw new Error(`edit-script: readBack.payload.side 가 ${String(p.side)} 이다`);
      if (!Array.isArray(p.rows)) throw new Error('edit-script: readBack.payload.rows 가 목록이 아니다');
      const rows = p.rows.map((r, k) => slot(r, `readBack.payload.rows[${k}]`, scene.entries.length));
      return {
        ...scene,
        entries: scene.entries.map((e) => ({ ...e })),
        backA: p.side === 'a' ? rows : scene.backA === null ? null : [...scene.backA],
        backB: p.side === 'b' ? rows : scene.backB === null ? null : [...scene.backB],
        step: { kind: 'readBack', side: p.side },
      };
    }
    throw new Error(`edit-script: 모르는 이벤트 ${event.type}`);
  },
};
