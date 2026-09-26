/**
 * invalidationCascade 의 장면.
 *
 * 바탕   — 층(식별자 · 가져오는 파일), 파일 내용, 파일 지문 두 판, 지난번 열쇠(캐시)
 * 자취   — 지금까지 지난 층의 이번 열쇠 셈과 판정 (층 차례)
 * 이번   — step: 처음인가, 몇째 층을 지났는가
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type CascadeLayer = { id: string; file: string | null };

export type CascadeFile = {
  name: string;
  before: string;
  after: string;
  /** 지문 여덟 자. init 전에는 null */
  fpBefore: string | null;
  fpAfter: string | null;
};

export type CascadeRow = {
  prevKey: string;
  fileFp: string;
  key: string;
  hit: boolean;
  prevChanged: boolean;
  fileChanged: boolean;
};

export type CascadeStep = { kind: 'start' } | { kind: 'layer'; index: number };

export type InvalidationCascadeScene = {
  layers: CascadeLayer[];
  files: CascadeFile[];
  oldKeys: string[];
  rows: CascadeRow[];
  step: CascadeStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readLayers(v: unknown): CascadeLayer[] {
  if (!Array.isArray(v)) return [];
  return v.map((item, i) => {
    if (!isRecord(item) || typeof item.id !== 'string') {
      throw new Error(`invalidationCascadeScene: layers[${i}] 의 id 가 없다`);
    }
    const file = item.file;
    if (file !== null && typeof file !== 'string') {
      throw new Error(`invalidationCascadeScene: layers[${i}] 의 file 은 글자이거나 null 이어야 한다`);
    }
    return { id: item.id, file };
  });
}

function readFiles(v: unknown): CascadeFile[] {
  if (!Array.isArray(v)) return [];
  return v.map((item, i) => {
    if (
      !isRecord(item) ||
      typeof item.name !== 'string' ||
      typeof item.before !== 'string' ||
      typeof item.after !== 'string'
    ) {
      throw new Error(`invalidationCascadeScene: files[${i}] 의 모양이 틀렸다`);
    }
    return { name: item.name, before: item.before, after: item.after, fpBefore: null, fpAfter: null };
  });
}

function reduceInit(scene: InvalidationCascadeScene, payload: unknown): InvalidationCascadeScene {
  if (!isRecord(payload) || !Array.isArray(payload.files) || !Array.isArray(payload.oldKeys)) {
    throw new Error('invalidationCascadeScene: init payload 의 모양이 틀렸다');
  }
  const prints = new Map<string, { fpBefore: string; fpAfter: string }>();
  for (const f of payload.files) {
    if (
      !isRecord(f) ||
      typeof f.name !== 'string' ||
      typeof f.fpBefore !== 'string' ||
      typeof f.fpAfter !== 'string'
    ) {
      throw new Error('invalidationCascadeScene: init 의 파일 지문 모양이 틀렸다');
    }
    prints.set(f.name, { fpBefore: f.fpBefore, fpAfter: f.fpAfter });
  }
  const oldKeys = payload.oldKeys.map((k, i) => {
    if (typeof k !== 'string') throw new Error(`invalidationCascadeScene: oldKeys[${i}] 가 글자가 아니다`);
    return k;
  });
  return {
    layers: scene.layers.map((l) => ({ ...l })),
    files: scene.files.map((f) => {
      const p = prints.get(f.name);
      if (!p) throw new Error(`invalidationCascadeScene: 파일 "${f.name}" 의 지문이 init 에 없다`);
      return { ...f, fpBefore: p.fpBefore, fpAfter: p.fpAfter };
    }),
    oldKeys,
    rows: [],
    step: { kind: 'start' },
  };
}

function reduceLayer(scene: InvalidationCascadeScene, payload: unknown): InvalidationCascadeScene {
  if (
    !isRecord(payload) ||
    typeof payload.index !== 'number' ||
    typeof payload.prevKey !== 'string' ||
    typeof payload.fileFp !== 'string' ||
    typeof payload.key !== 'string' ||
    typeof payload.hit !== 'boolean' ||
    typeof payload.prevChanged !== 'boolean' ||
    typeof payload.fileChanged !== 'boolean'
  ) {
    throw new Error('invalidationCascadeScene: layer payload 의 모양이 틀렸다');
  }
  if (payload.index !== scene.rows.length || payload.index >= scene.layers.length) {
    throw new Error(`invalidationCascadeScene: 층 ${payload.index} 이 차례에 맞지 않는다`);
  }
  const row: CascadeRow = {
    prevKey: payload.prevKey,
    fileFp: payload.fileFp,
    key: payload.key,
    hit: payload.hit,
    prevChanged: payload.prevChanged,
    fileChanged: payload.fileChanged,
  };
  return {
    layers: scene.layers.map((l) => ({ ...l })),
    files: scene.files.map((f) => ({ ...f })),
    oldKeys: [...scene.oldKeys],
    rows: [...scene.rows.map((r) => ({ ...r })), row],
    step: { kind: 'layer', index: payload.index },
  };
}

export const invalidationCascadeScene: ScenePlan<InvalidationCascadeScene> = {
  initial(initialData: unknown): InvalidationCascadeScene {
    const data = isRecord(initialData) ? initialData : {};
    return {
      layers: readLayers(data.layers),
      files: readFiles(data.files),
      oldKeys: [],
      rows: [],
      step: { kind: 'start' },
    };
  },
  reduce(scene: InvalidationCascadeScene, event: FacetRuntimeEvent): InvalidationCascadeScene {
    if (event.type === 'init') return reduceInit(scene, event.payload);
    if (event.type === 'layer') return reduceLayer(scene, event.payload);
    throw new Error(`invalidationCascadeScene: 모르는 이벤트 "${event.type}"`);
  },
};
