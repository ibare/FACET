/**
 * mode-chains-blocks 의 장면.
 *
 * 바탕(init 이 한 번 정한다) — 평문 덩어리 · IV · 열쇠.
 * 자취(걸음이 쌓는다) — 덩어리마다 건너온 값 · 상자에 든 값 · 암호문, 그리고 서로 다른 값의 셈.
 * 이번 걸음(step) — 무엇이 어디로 움직였는가.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowModeChainsBlocks } from './algorithm.js';

export type ChainBlock = { plain: string; chars: string[] };

export type ChainBase = {
  blocks: ChainBlock[];
  iv: string;
  key: string;
  distinctPlain: number;
};

export type ChainRow = {
  carried: string | null;
  input: string | null;
  cipher: string | null;
};

export type ChainStep =
  | { kind: 'start' }
  | { kind: 'carry'; index: number; from: number; carried: string; plain: string; input: string }
  | { kind: 'encrypt'; index: number; input: string; cipher: string };

export type ChainCount = { distinct: number; total: number };

export type ModeChainsBlocksScene = {
  base: ChainBase | null;
  rows: ChainRow[];
  inputs: ChainCount;
  ciphers: ChainCount;
  step: ChainStep;
};

const HEX4 = /^[0-9A-F]{4}$/;

function obj(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`mode-chains-blocks 장면: ${where} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function hex(v: unknown, where: string): string {
  if (typeof v !== 'string' || !HEX4.test(v)) throw new Error(`mode-chains-blocks 장면: ${where} 가 16 진 네 자리가 아니다`);
  return v;
}

function int(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error(`mode-chains-blocks 장면: ${where} 가 0 이상의 정수가 아니다`);
  return v;
}

function readBase(payload: unknown): ChainBase {
  const p = obj(payload, 'init.payload');
  if (!Array.isArray(p.blocks) || p.blocks.length === 0) throw new Error('mode-chains-blocks 장면: init.payload.blocks 가 빈 배열이다');
  const blocks = p.blocks.map((raw, i) => {
    const b = obj(raw, `init.payload.blocks[${i}]`);
    const chars = b.chars;
    if (!Array.isArray(chars) || chars.length !== 2 || !chars.every((c) => typeof c === 'string' && c.length === 1))
      throw new Error(`mode-chains-blocks 장면: init.payload.blocks[${i}].chars 가 글자 둘이 아니다`);
    return { plain: hex(b.plain, `init.payload.blocks[${i}].plain`), chars: [...(chars as string[])] };
  });
  const key = p.key;
  if (typeof key !== 'string' || !/^[0-9A-F]{8}$/.test(key)) throw new Error('mode-chains-blocks 장면: init.payload.key 가 16 진 여덟 자리가 아니다');
  return { blocks, iv: hex(p.iv, 'init.payload.iv'), key, distinctPlain: int(p.distinctPlain, 'init.payload.distinctPlain') };
}

function rowAt(scene: ModeChainsBlocksScene, index: number, where: string): ChainRow {
  const row = scene.rows[index - 1];
  if (!row) throw new Error(`mode-chains-blocks 장면: ${where}.index ${index} 인 덩어리가 없다`);
  return row;
}

export const modeChainsBlocksScene: ScenePlan<ModeChainsBlocksScene> = {
  initial(initialData: unknown): ModeChainsBlocksScene {
    // 모양만 검사한다. 덩어리 · 16 진 값은 알고리즘이 셈해 silent init 으로 보낸다
    narrowModeChainsBlocks(initialData);
    return { base: null, rows: [], inputs: { distinct: 0, total: 0 }, ciphers: { distinct: 0, total: 0 }, step: { kind: 'start' } };
  },

  reduce(scene: ModeChainsBlocksScene, event: FacetRuntimeEvent): ModeChainsBlocksScene {
    switch (event.type) {
      case 'init': {
        const base = readBase(event.payload);
        return {
          base,
          rows: base.blocks.map(() => ({ carried: null, input: null, cipher: null })),
          inputs: { distinct: 0, total: 0 },
          ciphers: { distinct: 0, total: 0 },
          step: { kind: 'start' },
        };
      }
      case 'carry': {
        if (!scene.base) throw new Error('mode-chains-blocks 장면: init 앞에 carry 가 왔다');
        const p = obj(event.payload, 'carry.payload');
        const index = int(p.index, 'carry.payload.index');
        const from = int(p.from, 'carry.payload.from');
        const row = rowAt(scene, index, 'carry.payload');
        if (from !== index - 1) throw new Error(`mode-chains-blocks 장면: carry.payload.from ${from} 이 index − 1 이 아니다`);
        const carried = hex(p.carried, 'carry.payload.carried');
        const expected = from === 0 ? scene.base.iv : scene.rows[from - 1]?.cipher;
        if (carried !== expected) throw new Error(`mode-chains-blocks 장면: carry.payload.carried ${carried} 가 앞 암호문과 다르다`);
        const plain = hex(p.plain, 'carry.payload.plain');
        if (plain !== scene.base.blocks[index - 1]!.plain) throw new Error('mode-chains-blocks 장면: carry.payload.plain 이 바탕과 다르다');
        if (row.carried !== null) throw new Error(`mode-chains-blocks 장면: 덩어리 ${index} 에 이미 건너온 값이 있다`);
        const input = hex(p.input, 'carry.payload.input');
        const rows = scene.rows.map((r, i) => (i === index - 1 ? { carried, input, cipher: null } : { ...r }));
        return {
          base: scene.base,
          rows,
          inputs: { distinct: int(p.distinctInputs, 'carry.payload.distinctInputs'), total: int(p.inputs, 'carry.payload.inputs') },
          ciphers: { ...scene.ciphers },
          step: { kind: 'carry', index, from, carried, plain, input },
        };
      }
      case 'encrypt': {
        if (!scene.base) throw new Error('mode-chains-blocks 장면: init 앞에 encrypt 가 왔다');
        const p = obj(event.payload, 'encrypt.payload');
        const index = int(p.index, 'encrypt.payload.index');
        const row = rowAt(scene, index, 'encrypt.payload');
        const input = hex(p.input, 'encrypt.payload.input');
        if (row.input !== input) throw new Error(`mode-chains-blocks 장면: encrypt.payload.input ${input} 이 겹친 값과 다르다`);
        if (row.cipher !== null) throw new Error(`mode-chains-blocks 장면: 덩어리 ${index} 는 이미 잠겼다`);
        const cipher = hex(p.cipher, 'encrypt.payload.cipher');
        const rows = scene.rows.map((r, i) => (i === index - 1 ? { ...r, cipher } : { ...r }));
        return {
          base: scene.base,
          rows,
          inputs: { ...scene.inputs },
          ciphers: { distinct: int(p.distinctCiphers, 'encrypt.payload.distinctCiphers'), total: int(p.ciphers, 'encrypt.payload.ciphers') },
          step: { kind: 'encrypt', index, input, cipher },
        };
      }
      default:
        throw new Error(`mode-chains-blocks 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
