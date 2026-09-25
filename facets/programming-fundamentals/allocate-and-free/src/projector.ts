/**
 * allocate-and-free projector — 걸음 이벤트를 무대의 모습 · 캡션으로, phase 를 코드 패널 켜짐으로 옮긴다.
 *
 * 걸음마다 payload 의 모습(Snapshot)을 typeof 가드로 좁혀 무대에 건넨다. 캡션의 수 · 주소는 모두 payload 에서
 * 온다 — 결론을 글자로 박지 않는다. 할당기가 움직이지 않는 걸음(phase 없음)에서는 코드 패널을 끈다.
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type {
  AllocateAndFreeStage,
  StageBlock,
  StageLine,
  StageSlot,
  StageSnapshot,
} from './allocate-and-free-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };
type Loose = Record<string, unknown>;

const isObj = (x: unknown): x is Loose => typeof x === 'object' && x !== null;
const num = (x: unknown, fallback = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
const str = (x: unknown, fallback = ''): string => (typeof x === 'string' ? x : fallback);

function readSlots(x: unknown): StageSlot[] {
  if (!Array.isArray(x)) return [];
  const out: StageSlot[] = [];
  for (const s of x) {
    if (!isObj(s)) continue;
    const kind = s.kind === 'null' || s.kind === 'int' || s.kind === 'ptr' ? s.kind : 'empty';
    out.push({ name: str(s.name), at: num(s.at), kind, value: num(s.value) });
  }
  return out;
}

function readBlocks(x: unknown): StageBlock[] {
  if (!Array.isArray(x)) return [];
  const out: StageBlock[] = [];
  for (const b of x) {
    if (!isObj(b) || typeof b.addr !== 'number' || typeof b.size !== 'number') continue;
    const status = b.status === 'lost' || b.status === 'free' ? b.status : 'held';
    out.push({ addr: b.addr, size: b.size, status });
  }
  return out;
}

function readNums(x: unknown): number[] {
  return Array.isArray(x) ? x.filter((v): v is number => typeof v === 'number') : [];
}

function readSnapshot(p: Loose): StageSnapshot {
  const cells: StageSnapshot['cells'] = [];
  if (Array.isArray(p.cells)) {
    for (const cell of p.cells) {
      if (isObj(cell) && typeof cell.addr === 'number' && typeof cell.value === 'number') {
        cells.push({ addr: cell.addr, value: cell.value });
      }
    }
  }
  return {
    outer: readSlots(p.outer),
    make: readSlots(p.make),
    blocks: readBlocks(p.blocks),
    cells,
    freeList: readNums(p.freeList),
    landEnd: num(p.landEnd),
    line: str(p.line),
    callLine: str(p.callLine),
  };
}

function readLines(x: unknown): StageLine[] {
  if (!Array.isArray(x)) return [];
  const out: StageLine[] = [];
  for (const l of x) {
    if (isObj(l) && typeof l.key === 'string' && typeof l.text === 'string') {
      out.push({ key: l.key, text: l.text, depth: num(l.depth) });
    }
  }
  return out;
}

const at = (addr: number): string => `@${addr}`;

export const allocateAndFreeProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as AllocateAndFreeStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let stepMs = 800;
  let litThisStep = false;
  // 움직임 길이 — 재생 속도를 그때그때 읽어 걸음 경계를 넘지 않게
  const ms = (): number => (stepMs * 0.7) / Math.max(0.25, runtime?.getSpeed() ?? 1);

  return {
    onInit(initialData) {
      if (isObj(initialData)) stepMs = num(initialData.stepMs, 800);
    },
    onEvent(event) {
      const p: Loose = isObj(event.payload) ? event.payload : {};
      switch (event.type) {
        case 'phase': {
          // silent 걸음 — 할당기 코드의 그 줄을 켠다
          code?.highlightPhase?.(typeof p.phase === 'string' ? p.phase : null);
          litThisStep = true;
          return;
        }
        default:
          break;
      }
      // 걸음 하나 — 할당기가 움직이지 않은 걸음이면 코드 패널의 앞 켜짐을 지운다
      if (!litThisStep) code?.clearHighlight?.();
      litThisStep = false;
      if (!stage) return;
      const snap = readSnapshot(p);
      const name = str(p.name);
      const addr = num(p.addr);
      // 지금 선 틀 수 — 바깥 틀 하나에 make 틀이 서 있으면 둘
      const frames = snap.make.length > 0 ? 2 : 1;

      switch (event.type) {
        case 'start': {
          stage.setProgram(readLines(p.lines), str(p.callee, 'make'), ms());
          stage.show(snap, ms());
          stage.setCaption(t('caption.start', 'Frames: {n} · New land end: {end}', { n: frames, end: at(snap.landEnd) }));
          return;
        }
        case 'bind': {
          stage.show(snap, ms());
          if (p.kind === 'null') {
            stage.setCaption(t('caption.null', '{name}: null', { name }));
          } else if (p.last === true) {
            const c = snap.outer[2];
            const d = snap.outer[3];
            stage.setCaption(
              t('caption.end', '{cName}: {c} · {dName}: {d}', {
                cName: c?.name ?? '',
                c: c && c.kind === 'ptr' ? at(c.value) : '',
                dName: d?.name ?? '',
                d: d && d.kind === 'ptr' ? at(d.value) : '',
              }),
            );
          } else if (p.kind === 'reuse') {
            stage.setCaption(t('caption.bindReuse', '{name}: {addr} · Free list: {n}', { name, addr: at(addr), n: num(p.listLength) }));
          } else {
            stage.setCaption(t('caption.bindFresh', '{name}: {addr} · New land end: {end}', { name, addr: at(addr), end: at(num(p.landEnd)) }));
          }
          return;
        }
        case 'call': {
          stage.show(snap, ms());
          if (p.kind === 'reuse') {
            stage.setCaption(t('caption.reuse', 'Block: {addr} · Free list: {n}', { addr: at(addr), n: num(p.listLength) }));
          } else {
            stage.setCaption(t('caption.fresh', 'Block: {addr} · New land end: {end}', { addr: at(addr), end: at(num(p.landEnd)) }));
          }
          return;
        }
        case 'return': {
          stage.show(snap, ms());
          const lost = num(p.lost, -1);
          if (lost >= 0) {
            stage.setCaption(t('caption.returnLost', '{name}: {addr} · Lost: {lost}', { name, addr: at(addr), lost: at(lost) }));
          } else {
            stage.setCaption(t('caption.return', '{name}: {addr} · Frames: {n}', { name, addr: at(addr), n: frames }));
          }
          return;
        }
        case 'write': {
          stage.show(snap, ms());
          const v = num(p.value);
          if (p.afterFree === true) {
            stage.setCaption(
              t('caption.writeFreed', 'Wrote {v} at {addr} · Use after free: {n}', { v, addr: at(addr), n: num(p.useAfterFree) }),
            );
          } else {
            stage.setCaption(t('caption.write', 'Wrote {v} at {addr}', { v, addr: at(addr) }));
          }
          return;
        }
        case 'release': {
          stage.show(snap, ms());
          stage.setCaption(t('caption.release', 'Returned: {addr} · Free list: {n}', { addr: at(addr), n: num(p.listLength) }));
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      litThisStep = false;
      code?.clearHighlight?.();
      stage?.clear();
    },
  };
};
