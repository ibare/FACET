/**
 * 파일 블록 배치 projector — 알고리즘 이벤트를 stage 호출과 코드 패널 켜짐으로 옮긴다.
 *
 *   round-start → stage.startRound + 캡션, 코드 패널 끔
 *   inode-read  → stage.readInode + 캡션
 *   fat-read    → stage.readFat + 캡션
 *   phase       → codePanel.highlightPhase
 *
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 로 나눈다 — 재생 속도를 올리면 운동도 짧아진다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { FatReadView, FileBlockPlacementStageApi, InodeReadView, RoundView } from './file-block-placement-stage.js';

interface CodePanelApi {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`[fileBlockPlacementProjector] payload.${key} 가 수가 아니다`);
  return v;
}

function obj(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) throw new Error(`[fileBlockPlacementProjector] ${what} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}

function readInodeRead(x: unknown): InodeReadView {
  const p = obj(x, 'inode 읽기');
  const role = p.role;
  if (role !== 'direct' && role !== 'one-level' && role !== 'two-level' && role !== 'mid' && role !== 'data') {
    throw new Error(`[fileBlockPlacementProjector] 모르는 inode 읽기 역할 ${String(role)}`);
  }
  const f = obj(p.from, 'from');
  let from: InodeReadView['from'];
  if (f.kind === 'slot') from = { kind: 'slot', slot: num(f, 'slot') };
  else if (f.kind === 'cell') from = { kind: 'cell', block: num(f, 'block'), cell: num(f, 'cell') };
  else throw new Error(`[fileBlockPlacementProjector] 모르는 from 종류 ${String(f.kind)}`);
  return { order: num(p, 'order'), block: num(p, 'block'), role, from };
}

function readFatRead(x: unknown): FatReadView {
  const p = obj(x, 'FAT 읽기');
  const role = p.role;
  if (role !== 'hop' && role !== 'data') throw new Error(`[fileBlockPlacementProjector] 모르는 FAT 읽기 역할 ${String(role)}`);
  return { order: num(p, 'order'), block: num(p, 'block'), role, next: num(p, 'next') };
}

function readRound(x: unknown): RoundView {
  const p = obj(x, 'round-start');
  if (typeof p.fileName !== 'string') throw new Error('[fileBlockPlacementProjector] fileName 이 없다');
  if (!Array.isArray(p.inodeReads) || !Array.isArray(p.fatReads)) throw new Error('[fileBlockPlacementProjector] 판의 길이 없다');
  return {
    k: num(p, 'k'),
    target: num(p, 'target'),
    fileName: p.fileName,
    inodeNumber: num(p, 'inodeNumber'),
    fatFirst: num(p, 'fatFirst'),
    inodeReads: p.inodeReads.map(readInodeRead),
    fatReads: p.fatReads.map(readFatRead),
  };
}

export const fileBlockPlacementProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as FileBlockPlacementStageApi | undefined;
  const code = views.codePanel as unknown as CodePanelApi | undefined;
  const t = runtime?.t ?? makeTranslator();
  let motionMs: number | null = null;
  const ms = (): number => {
    if (motionMs === null) throw new Error('[fileBlockPlacementProjector] initialData.motionMs 를 받지 못했다');
    return motionMs / Math.max(0.01, runtime?.getSpeed() ?? 1);
  };

  return {
    onInit(data: unknown) {
      motionMs = num(obj(data, 'initialData'), 'motionMs');
    },
    onEvent(e: FacetRuntimeEvent) {
      switch (e.type) {
        case 'phase': {
          const p = obj(e.payload, 'phase');
          if (typeof p.phase !== 'string') throw new Error('[fileBlockPlacementProjector] phase 이름이 없다');
          code?.highlightPhase(p.phase);
          return;
        }
        case 'round-start': {
          const r = readRound(e.payload);
          code?.clearHighlight();
          stage?.startRound(r, ms());
          stage?.setCaption(t('caption.start', 'Find position {k} of the file, starting from the two directory entries', { k: r.k }));
          return;
        }
        case 'inode-read': {
          const r = readInodeRead(e.payload);
          stage?.readInode(r, ms());
          if (r.role === 'direct') {
            if (r.from.kind !== 'slot') throw new Error('[fileBlockPlacementProjector] 직접 칸 읽기에 inode 칸이 없다');
            stage?.setCaption(t('caption.inodeDirect', 'inode direct slot {slot} → read data block {b}', { slot: r.from.slot + 1, b: r.block }));
          } else if (r.role === 'one-level') {
            stage?.setCaption(t('caption.inodeOne', 'inode single indirect slot → read pointer block {b}', { b: r.block }));
          } else if (r.role === 'two-level') {
            stage?.setCaption(t('caption.inodeTwo', 'inode double indirect slot → read pointer block {b}', { b: r.block }));
          } else {
            if (r.from.kind !== 'cell') throw new Error('[fileBlockPlacementProjector] 번호 블록 칸이 없다');
            if (r.role === 'mid') {
              stage?.setCaption(t('caption.inodeMid', 'Slot {cell} of block {from} → read pointer block {b}', { cell: r.from.cell + 1, from: r.from.block, b: r.block }));
            } else {
              stage?.setCaption(t('caption.inodeData', 'Slot {cell} of block {from} → read data block {b}', { cell: r.from.cell + 1, from: r.from.block, b: r.block }));
            }
          }
          return;
        }
        case 'fat-read': {
          const r = readFatRead(e.payload);
          stage?.readFat(r, ms());
          if (r.role === 'hop') {
            stage?.setCaption(t('caption.fatHop', 'Read table entry {b} → next block {n}', { b: r.block, n: r.next }));
          } else {
            stage?.setCaption(t('caption.fatData', 'Read data block {b}', { b: r.block }));
          }
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      code?.clearHighlight();
    },
  };
};
