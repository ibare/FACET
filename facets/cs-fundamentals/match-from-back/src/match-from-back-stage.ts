/**
 * match-from-back-stage — 거꾸로 짚어 오는 그림.
 *
 * ── 형태가 어디서 나왔는가
 *
 * 동사가 "거꾸로 짚어 온다 — 오른쪽 끝에서 왼쪽으로" 이므로 화면의 주된 운동은
 * **왼쪽으로 가는 표지**다.
 *
 *   글      한 줄로 늘어선 스물넷. 자리는 고정이다.
 *   패턴    글 아래에 놓인 슬래브. 자리를 옮길 때마다 가로로 미끄러진다.
 *   표지    슬래브의 **오른쪽 끝**에서 출발해 한 칸씩 왼쪽으로 옮겨 간다.
 *           지나온 길은 자취 선으로 뒤에 남아 "어디까지 거슬러 왔는가" 가 보인다.
 *   들림    짚는 칸은 글 쪽으로 들린다. 맞으면 들린 채 붙어 있고 어긋나면 내려앉는다.
 *   눈금    본 글자 위에만 눈금이 선다. 재는 자리에 값을 남기는 것이라 옆에 계기를
 *           두지 않는다 (S-piece).
 *   떨굼    끝에 가서, **한 번도 보지 않은 글자**가 줄에서 내려앉는다. 남아 선 것이
 *           실제로 읽은 글자다 — 이 조각이 하려는 말이 마지막 운동으로 나온다.
 *
 * 세로(H)는 그림이 정하는 값이라 여기 상수로 둔다. 가로는 러너가
 * `PIECE_CANVAS_W` 로 정하므로 캔버스 선언에 적지 않는다 (S-piece · S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 164;

const SIDE_MIN = 18;
const CELL_MAX_W = 30;
const CELL_H = 32;

const TICK_Y = 16;
const TICK_H = 10;
const TEXT_Y = 34;
const PAT_Y = 86;
const CAPTION_Y = 152;

/** 슬래브 안쪽 좌표 — 자취 선과 표지가 사는 줄. */
const TRAIL_DY = CELL_H + 12;

const PARK_DY = 14;
const LIFT = 6;
const FOUND_RISE = 14;
const DROP = 14;
const DIP = 8;

const FRAME_MS = 16;
const ANIM_LAND = 320;
const ANIM_PROBE = 170;
const ANIM_LIFT = 110;
const ANIM_DIP = 260;
const ANIM_RISE = 300;
const ANIM_DROP = 380;

type CellKind = 'idle' | 'comparing' | 'matched' | 'broken' | 'unread' | 'muted';

type Cell = {
  group: SVGGElement;
  rect: SVGRectElement;
  glyph: SVGGraphicsElement;
};

type Scene = { text: string; pattern: string };

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 다시 좁혀 밀어 넣지
 * 않는다 (S-piece · C9).
 */
function readScene(initialData: unknown): Scene {
  const d =
    typeof initialData === 'object' && initialData !== null
      ? (initialData as Record<string, unknown>)
      : {};
  return {
    text: typeof d.text === 'string' ? d.text : '',
    pattern: typeof d.pattern === 'string' ? d.pattern : '',
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function lerp(from: number, to: number, p: number): number {
  return from + (to - from) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function mount(
  _container: HTMLElement,
  params: ViewMountParams & { canvas: SVGSVGElement },
): ViewInstance {
  const canvas = params.canvas;
  const colors: Palette = getColors(params.theme);
  const scene = readScene(params.initialData);

  const text = scene.text;
  const pattern = scene.pattern;
  const n = Math.max(1, text.length);
  const m = Math.max(1, pattern.length);

  // 크기는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
  const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / n));
  const originX = Math.round((W - n * cellW) / 2);
  const cellX = (i: number): number => originX + i * cellW;

  const paint: Record<CellKind, { fill: string; stroke: string; ink: string; dash: string }> = {
    idle: { fill: colors.bg, stroke: colors.border, ink: colors.text, dash: 'none' },
    comparing: {
      fill: colors.itemComparing,
      stroke: colors.itemComparing,
      ink: colors.stateInk,
      dash: 'none',
    },
    matched: { fill: colors.itemPivot, stroke: colors.itemPivot, ink: colors.stateInk, dash: 'none' },
    broken: { fill: colors.danger, stroke: colors.danger, ink: colors.stateInk, dash: 'none' },
    unread: { fill: colors.bg, stroke: colors.ghostOutline, ink: colors.textMuted, dash: '3 3' },
    muted: { fill: colors.bgSubtle, stroke: colors.border, ink: colors.textMuted, dash: 'none' },
  };

  // ── 뼈대
  const root = el('g');
  canvas.appendChild(root);

  const tickLayer = el('g');
  const textLayer = el('g');
  const linkLayer = el('g');
  const slab = el('g');
  root.appendChild(tickLayer);
  root.appendChild(textLayer);
  root.appendChild(linkLayer);
  root.appendChild(slab);

  /** 짚고 있는 글자와 패턴 글자를 잇는 세로 실. */
  const link = el('line', {
    x1: 0,
    x2: 0,
    y1: TEXT_Y + CELL_H,
    y2: PAT_Y,
    stroke: colors.text,
    'stroke-width': 1.5,
    visibility: 'hidden',
  });
  linkLayer.appendChild(link);

  function makeCell(x: number, y: number, ch: string, kind: CellKind): Cell {
    const group = el('g', { transform: 'translate(0, 0)' });
    const rect = el('rect', {
      x,
      y,
      width: cellW - 2,
      height: CELL_H,
      rx: 3,
      fill: paint[kind].fill,
      stroke: paint[kind].stroke,
      'stroke-width': 1,
    });
    group.appendChild(rect);

    // 빈칸은 글자가 없다 — 낮은 막대 하나로 자리만 보인다 (도형이라 문안이 아니다).
    const glyph: SVGGraphicsElement =
      ch === ' '
        ? el('rect', {
            x: x + (cellW - 2) / 2 - cellW * 0.2,
            y: y + CELL_H * 0.66,
            width: cellW * 0.4,
            height: 2,
            fill: paint[kind].ink,
          })
        : el('text', {
            x: x + (cellW - 2) / 2,
            y: y + CELL_H * 0.68,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: paint[kind].ink,
          });
    if (ch !== ' ') glyph.textContent = ch;
    group.appendChild(glyph);
    return { group, rect, glyph };
  }

  function setCell(cell: Cell, kind: CellKind): void {
    const c = paint[kind];
    cell.rect.setAttribute('fill', c.fill);
    cell.rect.setAttribute('stroke', c.stroke);
    cell.rect.setAttribute('stroke-dasharray', c.dash);
    cell.glyph.setAttribute('fill', c.ink);
  }

  const textCells: Cell[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const cell = makeCell(cellX(i), TEXT_Y, text[i], 'idle');
    textLayer.appendChild(cell.group);
    textCells.push(cell);
  }

  const patCells: Cell[] = [];
  for (let k = 0; k < pattern.length; k += 1) {
    const cell = makeCell(k * cellW, 0, pattern[k], 'idle');
    slab.appendChild(cell.group);
    patCells.push(cell);
  }

  /** 짚어 온 길 — 슬래브 오른쪽 끝에서 표지까지 뒤로 늘어난다. */
  const trail = el('line', {
    x1: m * cellW - 2,
    x2: m * cellW - 2,
    y1: TRAIL_DY,
    y2: TRAIL_DY,
    stroke: colors.textMuted,
    'stroke-width': 2,
    'stroke-linecap': 'round',
  });
  slab.appendChild(trail);

  const probe = el('path', {
    d: `M 0 ${TRAIL_DY - 6} l 5 6 l -5 6 z`,
    fill: colors.text,
    visibility: 'hidden',
  });
  slab.appendChild(probe);

  const caption = el('text', {
    x: W / 2,
    y: CAPTION_Y,
    'text-anchor': 'middle',
    'font-family': fonts.body,
    'font-size': fontSizes.sm,
    fill: colors.text,
  });
  root.appendChild(caption);

  // ── 상태
  let destroyed = false;
  const waiters = new Set<() => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const ticks = new Map<number, SVGRectElement>();
  let slabX = cellX(0);
  let slabY = PAT_Y + PARK_DY;
  let probeX = m * cellW - 2;

  function setSlab(x: number, y: number): void {
    slabX = x;
    slabY = y;
    slab.setAttribute('transform', `translate(${x}, ${y})`);
  }

  function setProbe(x: number): void {
    probeX = x;
    probe.setAttribute('transform', `translate(${x}, 0)`);
    trail.setAttribute('x2', String(x));
  }

  function setLift(k: number, dy: number): void {
    patCells[k]?.group.setAttribute('transform', `translate(0, ${-dy})`);
  }

  function setDrop(i: number, dy: number): void {
    textCells[i]?.group.setAttribute('transform', `translate(0, ${dy})`);
  }

  function markLooked(i: number): void {
    if (ticks.has(i)) return;
    const tick = el('rect', {
      x: cellX(i) + (cellW - 2) / 2 - 1,
      y: TICK_Y,
      width: 2,
      height: TICK_H,
      rx: 1,
      fill: colors.textMuted,
    });
    tickLayer.appendChild(tick);
    ticks.set(i, tick);
  }

  /** 한 자리를 떠날 때 — 칸 색과 들림, 자취와 실을 처음으로 돌린다. */
  function clearLook(): void {
    for (let k = 0; k < patCells.length; k += 1) {
      setCell(patCells[k], 'idle');
      setLift(k, 0);
    }
    for (const cell of textCells) setCell(cell, 'idle');
    link.setAttribute('visibility', 'hidden');
    probe.setAttribute('visibility', 'hidden');
    setProbe(m * cellW - 2);
  }

  function tween(ms: number, apply: (p: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      if (destroyed) return resolve();
      if (ms <= 0) {
        apply(1);
        return resolve();
      }
      const start = Date.now();
      const finish = (): void => {
        waiters.delete(finish);
        resolve();
      };
      waiters.add(finish);
      const tick = (): void => {
        if (destroyed) return;
        const raw = Math.min(1, (Date.now() - start) / ms);
        apply(ease(raw));
        if (raw >= 1) {
          finish();
          return;
        }
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      };
      tick();
    });
  }

  setSlab(slabX, slabY);
  setProbe(probeX);

  return {
    setCaption(value: string): void {
      caption.textContent = value;
    },

    /** 패턴이 그 자리로 미끄러져 내려앉는다. */
    async land(shift: number): Promise<void> {
      clearLook();
      const fromX = slabX;
      const fromY = slabY;
      const toX = cellX(shift);
      await tween(ANIM_LAND, (p) => {
        setSlab(lerp(fromX, toX, p), lerp(fromY, PAT_Y, p));
      });
    },

    /** 오른쪽 끝에서부터 왼쪽으로 한 칸 짚는다. */
    async compare(shift: number, patIndex: number, matched: boolean): Promise<void> {
      const textIndex = shift + patIndex;
      markLooked(textIndex);

      const patCell = patCells[patIndex];
      const textCell = textCells[textIndex];
      if (patCell) setCell(patCell, 'comparing');
      if (textCell) setCell(textCell, 'comparing');

      link.setAttribute('x1', String(cellX(textIndex) + (cellW - 2) / 2));
      link.setAttribute('x2', String(cellX(textIndex) + (cellW - 2) / 2));
      link.setAttribute('visibility', 'visible');
      probe.setAttribute('visibility', 'visible');

      // 표지가 왼쪽으로 옮겨 가고 자취가 그만큼 늘어난다.
      const fromX = probeX;
      const toX = patIndex * cellW + (cellW - 2) / 2;
      await tween(ANIM_PROBE, (p) => setProbe(lerp(fromX, toX, p)));

      // 짚은 칸이 글 쪽으로 든다.
      await tween(ANIM_LIFT, (p) => setLift(patIndex, LIFT * p));

      if (matched) {
        if (patCell) setCell(patCell, 'matched');
        if (textCell) setCell(textCell, 'matched');
        return;
      }
      if (patCell) setCell(patCell, 'broken');
      if (textCell) setCell(textCell, 'broken');
      await tween(ANIM_LIFT, (p) => setLift(patIndex, LIFT * (1 - p)));
    },

    /** 어긋났다 — 짚지 않은 앞쪽이 읽히지 않은 채 남고, 자리가 떨어져 나간다. */
    async reject(shift: number, tailMatched: number): Promise<void> {
      // 실은 글과 패턴 사이에 걸려 있다. 슬래브가 움직이는 동안에는 걷는다.
      link.setAttribute('visibility', 'hidden');
      const breakIndex = patCells.length - 1 - tailMatched;
      for (let k = 0; k < breakIndex; k += 1) setCell(patCells[k], 'unread');
      const baseX = cellX(shift);
      await tween(ANIM_DIP, (p) => setSlab(baseX, PAT_Y + Math.sin(p * Math.PI) * DIP));
    },

    /** 뒤에서부터 전부 맞았다 — 슬래브가 글에 붙는다. */
    async accept(shift: number): Promise<void> {
      link.setAttribute('visibility', 'hidden');
      for (const cell of patCells) setCell(cell, 'matched');
      for (let k = 0; k < patCells.length; k += 1) {
        const cell = textCells[shift + k];
        if (cell) setCell(cell, 'matched');
      }
      const baseX = cellX(shift);
      await tween(ANIM_RISE, (p) => setSlab(baseX, PAT_Y - FOUND_RISE * p));
    },

    /** 한 번도 보지 않은 글자가 줄에서 내려앉는다. */
    async dropUnread(): Promise<void> {
      link.setAttribute('visibility', 'hidden');
      const idle: number[] = [];
      for (let i = 0; i < textCells.length; i += 1) {
        if (ticks.has(i)) continue;
        setCell(textCells[i], 'muted');
        idle.push(i);
      }
      await tween(ANIM_DROP, (p) => {
        for (const i of idle) setDrop(i, DROP * p);
      });
    },

    /** 처음으로 되감는다 — 손으로 짚어 보기 직전의 자리. */
    rewind(): void {
      caption.textContent = '';
      for (const tick of ticks.values()) tick.remove();
      ticks.clear();
      for (let i = 0; i < textCells.length; i += 1) setDrop(i, 0);
      clearLook();
      setSlab(cellX(0), PAT_Y + PARK_DY);
    },

    destroy(): void {
      destroyed = true;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      // 걸어 둔 것을 거둔 뒤 기다리던 것을 깨운다 — 안 깨우면 emit 이 영영
      // 돌아오지 않아 알고리즘과 SVG 가 통째로 붙들린다 (S-piece).
      for (const wake of [...waiters]) wake();
      waiters.clear();
      root.remove();
    },
  };
}

export const matchFromBackStageView: CanvasView = {
  canvas: { height: H, fit: 'fill' },
  mount,
};
