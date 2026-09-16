/**
 * grow-and-copy-stage — 재할당 조각의 전용 시각화.
 *
 * 동사가 "옮긴다" 이므로 값은 실제로 자리를 옮긴다. 옛 블록과 새 블록을 나란히
 * 놓고, 복사되는 값마다 칩 하나가 옛 칸에서 새 칸으로 날아간다. 옛 블록은 아래로
 * 떨어져 화면 밖으로 사라지고, 남은 새 블록은 가운데로 미끄러져 들어와 옛 블록이
 * 있던 자리를 대신한다 — 주소가 바뀌는 일이 위치로 보인다.
 *
 * 좌표계는 이 그림이 정한다. 가로 한 줄에 두 블록을 왼쪽(옛) → 오른쪽(새) 으로
 * 두어 시간의 방향과 읽는 방향을 맞추고, 넣지 못한 값은 줄 위에 떠서 기다린다.
 * 옛 블록이 사라지면 새 블록은 가운데로 온다 — 자리는 장면이 아니라 여기서 셈한다.
 *
 * ── 장면 하나로 화면을 세운다
 *
 * 걸음마다 부르는 메서드(`blockFull()` · `allocate()` · `copyValue()` …) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render(next, prev, { animate })` 하나가 **그
 * 장면의 화면 전체**를 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은 길이다
 * (S-scene). 장면의 모양은 `scene.ts`.
 *
 * 흐르게 하는 것은 그 위에 덧댄다. 정적 그리기가 정본이므로 운동은 **끝 자리에
 * 서 있는 것을 출발 자리로 물렸다가 되돌리는** 꼴이 되고, 운동이 끝나면 그 장면을
 * 다시 한 번 통째로 세운다 — 흐르며 선 화면과 곧바로 세운 화면이 속성 하나라도
 * 다르면 되짚기 판정이 어긋나기 때문이다.
 *
 * 화면 문자열은 `params.t` 로만 짓는다 (C10). 이 파일에 en 원본이 있는 것은
 * 조회가 빗나갔을 때의 되받이뿐이고, 칸 안의 숫자와 주소 표기는 데이터 그대로다.
 */

import {
  getColors,
  fonts,
  fontSizes,
  space,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { GrowAndCopyScene, GrowBlockScene, GrowCaption, GrowMark } from './scene.js';

// ── 좌표 ────────────────────────────────────────────────────────────────
const W = PIECE_CANVAS_W;
const H = 196;

const CELL_W = 34;
const CELL_H = 44;
const CELL_GAP = 5;
const PITCH = CELL_W + CELL_GAP;

/** 칸 줄의 윗변. */
const ROW_Y = 88;
/** 옛 블록 왼쪽 끝. */
const OLD_X = 53;
/** 옛 블록과 새 블록 사이. */
const GROUP_GAP = 56;
/** 넣지 못한 값이 기다리는 자리 — 줄 위. */
const PARK_X = 313;
const PARK_Y = 20;
/** 막힌 값이 내려오기 시작하는 높이 — 캔버스 위쪽 밖. */
const DROP_IN_Y = -CELL_H - 12;
/** 복사 칩이 그리는 포물선의 높이. */
const ARC_LIFT = 24;
/** 버려진 블록이 떨어지는 거리 (viewBox 밖으로 나가 잘린다). */
const DROP_Y = 78;

const META_ADDR_Y = ROW_Y + CELL_H + 22;
const META_SIZE_Y = META_ADDR_Y + 17;

const blockWidth = (capacity: number): number => capacity * PITCH - CELL_GAP;
const centeredX = (capacity: number): number => Math.round((W - blockWidth(capacity)) / 2);

// ── 시간 ────────────────────────────────────────────────────────────────
const T_DROP_IN = 220;
const T_BUMP = 260;
const T_HOLD = 150;
const T_BOUNCE = 260;
const T_UNROLL = 460;
const T_ARC = 220;
const T_RELEASE = 380;
const T_SLIDE = 460;
const T_LAND = 360;

const EASE_OUT = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const EASE_IN = 'cubic-bezier(0.55, 0.06, 0.68, 0.19)';
const EASE_BOTH = 'cubic-bezier(0.65, 0, 0.35, 1)';

const SVG_NS = 'http://www.w3.org/2000/svg';

type CellState = 'empty' | 'filled' | 'active' | 'copied' | 'released';

type Cell = { rect: SVGRectElement; label: SVGTextElement };

type Block = {
  root: SVGGElement;
  cellsG: SVGGElement;
  metaG: SVGGElement;
  addr: SVGTextElement;
  cells: Cell[];
  x: number;
  capacity: number;
};

/**
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면이 말하는 화면을 통째로
 * 세우므로, 되돌릴 명령이 있을 자리가 없다 (S-scene).
 */
export type GrowAndCopyStage = ViewInstance & {
  render(
    next: GrowAndCopyScene,
    prev: GrowAndCopyScene | null,
    opts: { animate: boolean },
  ): Promise<void>;
};

const tf = (x: number, y: number, sx = 1, sy = 1): string =>
  `translate(${x}px, ${y}px) scale(${sx}, ${sy})`;

export const growAndCopyStageView: CanvasView = {
  canvas: { height: H },
  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    const root = document.createElement('div');
    root.className = 'facet-grow-and-copy';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.alignItems = 'center';
    root.style.gap = space.sm;
    root.style.width = '100%';
    root.style.fontFamily = fonts.body;

    // 러너가 슬롯에 붙여 준 캔버스를 root 안으로 옮긴다 — 아래에 캡션 DOM 이 붙는다.
    const svg = params.canvas;
    root.appendChild(svg);

    const captionEl = document.createElement('div');
    captionEl.className = 'facet-grow-and-copy__caption';
    captionEl.style.minHeight = '38px';
    captionEl.style.maxWidth = `${W}px`;
    captionEl.style.textAlign = 'center';
    captionEl.style.fontSize = fontSizes.md;
    captionEl.style.lineHeight = '1.45';
    captionEl.style.color = colors.text;
    root.appendChild(captionEl);

    container.appendChild(root);

    // ── 시간 관리 ────────────────────────────────────────────────────────
    // 애니메이션 promise 는 반드시 타이머로만 풀린다. 러너의 reset 이
    // 실행 중인 알고리즘을 await 하므로, 풀리지 않는 promise 는 곧 잠금이다.
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    /**
     * 되짚는 중인가. 러너가 `params` 로 흘린다 (`ViewMountParams.isInstant`).
     *
     * 이 조각의 운동은 CSS 전환이 아니라 **타이머로 길이를 재는** 것이라, 되짚기가
     * 끼어들면 앞 걸음의 타이머가 뒤늦게 깨어나 이미 세운 화면 위에 옛 장면을 다시
     * 세운다. 참이면 기다리지 않고 곧바로 끝 자리로 간다.
     */
    const isInstant = params.isInstant ?? ((): boolean => false);

    // 되짚기 직전에 걸어 둔 것을 거둔다 (S-piece 의 destroy 규약과 같은 모양).
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed || isInstant()) return resolve();
        const settleOne = (): void => {
          waiters.delete(settleOne);
          resolve();
        };
        waiters.add(settleOne);
        const id = setTimeout(() => {
          timers.delete(id);
          settleOne();
        }, ms);
        timers.add(id);
      });

    const raf = (fn: () => void): void => {
      if (typeof requestAnimationFrame !== 'function') {
        fn();
        return;
      }
      const outer = requestAnimationFrame(() => {
        frames.delete(outer);
        const inner = requestAnimationFrame(() => {
          frames.delete(inner);
          fn();
        });
        frames.add(inner);
      });
      frames.add(outer);
    };

    /**
     * 요소를 목표 transform 으로 흘려보낸다.
     *
     * 되짚는 중이면 전환을 걸지 않고 곧바로 목표에 세운다 — 되짚기 경로에서는
     * 타이머도 프레임도 남기지 않아야 한다 (S-scene).
     */
    const glide = (
      el: SVGGElement,
      transform: string,
      ms: number,
      easing: string = EASE_BOTH,
      opacity?: number,
    ): Promise<void> => {
      if (destroyed || isInstant()) {
        el.style.removeProperty('transition');
        el.style.transform = transform;
        if (opacity !== undefined) el.style.opacity = String(opacity);
        return Promise.resolve();
      }
      el.style.transition = `transform ${ms}ms ${easing}, opacity ${ms}ms linear`;
      raf(() => {
        el.style.transform = transform;
        if (opacity !== undefined) el.style.opacity = String(opacity);
      });
      return wait(ms + 60);
    };

    // ── SVG 조립 ─────────────────────────────────────────────────────────
    const node = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs?: Record<string, string | number>,
    ): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG_NS, tag);
      if (attrs) {
        for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      }
      return e;
    };

    const paintCell = (cell: Cell, state: CellState, value?: number): void => {
      const { rect, label } = cell;
      rect.style.transition = 'fill 200ms linear, stroke 200ms linear';
      rect.removeAttribute('stroke-dasharray');
      switch (state) {
        case 'empty':
          rect.setAttribute('fill', colors.bg);
          rect.setAttribute('stroke', colors.border);
          rect.setAttribute('stroke-dasharray', '4 4');
          label.textContent = '';
          break;
        case 'filled':
          rect.setAttribute('fill', colors.itemDefault);
          rect.setAttribute('stroke', colors.border);
          label.setAttribute('fill', colors.text);
          break;
        case 'active':
          rect.setAttribute('fill', colors.itemActive);
          rect.setAttribute('stroke', colors.itemActive);
          label.setAttribute('fill', colors.textInverse);
          break;
        case 'copied':
          rect.setAttribute('fill', colors.itemSorted);
          rect.setAttribute('stroke', colors.itemSorted);
          label.setAttribute('fill', colors.textInverse);
          break;
        case 'released':
          rect.setAttribute('fill', colors.bg);
          rect.setAttribute('stroke', colors.textMuted);
          rect.setAttribute('stroke-dasharray', '3 5');
          label.setAttribute('fill', colors.textMuted);
          break;
      }
      if (value !== undefined) label.textContent = String(value);
    };

    const makeCell = (index: number): { g: SVGGElement; cell: Cell } => {
      const g = node('g');
      const rect = node('rect', {
        x: index * PITCH,
        y: ROW_Y,
        width: CELL_W,
        height: CELL_H,
        rx: 4,
      });
      rect.setAttribute('vector-effect', 'non-scaling-stroke');
      rect.setAttribute('stroke-width', '1.5');
      const label = node('text', {
        x: index * PITCH + CELL_W / 2,
        y: ROW_Y + CELL_H / 2 + 6,
        'text-anchor': 'middle',
      });
      label.style.fontFamily = fonts.mono;
      label.style.fontSize = fontSizes.lg;
      label.style.fontWeight = '600';
      g.appendChild(rect);
      g.appendChild(label);
      return { g, cell: { rect, label } };
    };

    /** 크기 표기. 문안은 저작 선언에서 온다 (C10). */
    const metaText = (bytes: number, capacity: number): string =>
      tr('label.meta', '{bytes} bytes / {capacity} slots', { bytes, capacity });

    /**
     * 블록 하나를 세운다.
     *
     * 칸의 상태는 `stateAt` 이 정한다 — 같은 자료라도 옛 블록은 복사해 낸 앞칸이
     * 어두워지고, 버려지는 블록은 전부 흐려지기 때문이다.
     */
    const buildBlock = (
      b: GrowBlockScene,
      x: number,
      stateAt: (index: number) => CellState,
    ): Block => {
      const blockRoot = node('g');
      blockRoot.style.transformOrigin = '0 0';
      blockRoot.style.transform = tf(x, 0);

      const cellsG = node('g');
      cellsG.style.transformOrigin = '0 0';
      cellsG.style.transform = tf(0, 0);

      const cells: Cell[] = [];
      for (let i = 0; i < b.capacity; i += 1) {
        const made = makeCell(i);
        cellsG.appendChild(made.g);
        cells.push(made.cell);
        const v = b.cells[i];
        paintCell(made.cell, stateAt(i), v === null || v === undefined ? undefined : v);
      }

      const metaG = node('g');
      metaG.style.transformOrigin = '0 0';
      metaG.style.transform = tf(0, 0);
      const midX = blockWidth(b.capacity) / 2;
      const addr = node('text', { x: midX, y: META_ADDR_Y, 'text-anchor': 'middle' });
      addr.style.fontFamily = fonts.mono;
      addr.style.fontSize = fontSizes.sm;
      addr.setAttribute('fill', colors.text);
      addr.textContent = b.address;
      const meta = node('text', { x: midX, y: META_SIZE_Y, 'text-anchor': 'middle' });
      meta.style.fontFamily = fonts.body;
      meta.style.fontSize = fontSizes.xs;
      meta.setAttribute('fill', colors.textMuted);
      meta.textContent = metaText(b.bytes, b.capacity);
      metaG.appendChild(addr);
      metaG.appendChild(meta);

      blockRoot.appendChild(cellsG);
      blockRoot.appendChild(metaG);
      return { root: blockRoot, cellsG, metaG, addr, cells, x, capacity: b.capacity };
    };

    const makeChip = (value: number, x: number, y: number): SVGGElement => {
      const g = node('g');
      g.style.transformOrigin = '0 0';
      g.style.transform = tf(x, y);
      const rect = node('rect', { x: 0, y: 0, width: CELL_W, height: CELL_H, rx: 4 });
      rect.setAttribute('fill', colors.itemActive);
      rect.setAttribute('stroke', colors.itemActive);
      rect.setAttribute('stroke-width', '1.5');
      const label = node('text', {
        x: CELL_W / 2,
        y: CELL_H / 2 + 6,
        'text-anchor': 'middle',
      });
      label.style.fontFamily = fonts.mono;
      label.style.fontSize = fontSizes.lg;
      label.style.fontWeight = '600';
      label.setAttribute('fill', colors.textInverse);
      label.textContent = String(value);
      g.appendChild(rect);
      g.appendChild(label);
      return g;
    };

    // ── 자리 셈 ──────────────────────────────────────────────────────────
    //
    // 장면은 자리를 모른다. 블록 둘이 나란히 설지 하나가 가운데 설지는 옛 블록의
    // 있고 없음이 이미 말하므로 여기서 역산한다 (S-piece).

    /** 옛 블록이 아직 있을 때 새 블록이 서는 자리 — 그 오른쪽. */
    const besideX = (oldCapacity: number): number =>
      OLD_X + blockWidth(oldCapacity) + GROUP_GAP;

    const newBlockX = (s: GrowAndCopyScene): number => {
      if (!s.newBlock) return 0;
      return s.oldBlock ? besideX(s.oldBlock.capacity) : centeredX(s.newBlock.capacity);
    };

    // ── 캡션 ─────────────────────────────────────────────────────────────
    //
    // 장면은 무엇을 말할지와 그 인자만 담는다. 문자는 여기서 만든다 (C10).
    const captionText = (c: GrowCaption | null): string => {
      if (!c) return '';
      switch (c.kind) {
        case 'blocked':
          return tr(
            'caption.blocked',
            'One more value arrives: {value}. Every one of the {capacity} slots is taken, and the block cannot stretch.',
            { value: c.value, capacity: c.capacity },
          );
        case 'allocated':
          return tr(
            'caption.allocated',
            'So a bigger block is taken somewhere else: {bytes} bytes at {address}, room for {capacity}.',
            { bytes: c.bytes, address: c.address, capacity: c.capacity },
          );
        case 'copying':
          return tr(
            'caption.copying',
            'Nothing moves itself. Each value is copied over, one at a time — {done} of {total}.',
            { done: c.done, total: c.total },
          );
        case 'freed':
          return tr(
            'caption.freed',
            'The old block at {oldAddress} is given back. The array lives at {newAddress} now — the address changed.',
            { oldAddress: c.oldAddress, newAddress: c.newAddress },
          );
        case 'appended':
          return tr('caption.appended', 'Now {value} fits. It goes into index {index}.', {
            value: c.value,
            index: c.index,
          });
        case 'done':
          return tr(
            'caption.done',
            'Capacity {capacity}, {size} values, {free} slots to spare — and a different address than the one it started at.',
            { capacity: c.capacity, size: c.size, free: c.free },
          );
      }
    };

    // ── 장면 그리기 ──────────────────────────────────────────────────────
    //
    // 늘 비우고 시작해 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않으므로
    // 되돌릴 명령이 있을 자리가 없다.

    let oldB: Block | null = null;
    let newB: Block | null = null;
    let chipLayer: SVGGElement = node('g');
    let parked: SVGGElement | null = null;

    const stand = (s: GrowAndCopyScene): void => {
      svg.textContent = '';
      oldB = null;
      newB = null;
      parked = null;

      const ob = s.oldBlock;
      if (ob) {
        const copied = s.copied;
        oldB = buildBlock(ob, OLD_X, (i) => {
          if (i < copied) return 'copied';
          return ob.cells[i] === null ? 'empty' : 'filled';
        });
        svg.appendChild(oldB.root);
      }

      const nb = s.newBlock;
      if (nb) {
        newB = buildBlock(nb, newBlockX(s), (i) => (nb.cells[i] === null ? 'empty' : 'filled'));
        svg.appendChild(newB.root);
      }

      // 칩은 늘 맨 위 층이다 — 블록 위를 건너다니기 때문이다.
      chipLayer = node('g');
      svg.appendChild(chipLayer);

      if (s.pending !== null) {
        parked = makeChip(s.pending, PARK_X, PARK_Y);
        chipLayer.appendChild(parked);
      }
    };

    /** 장면 하나를 통째로 세운다 — 칸도 블록도 칩도 캡션도. */
    const settle = (s: GrowAndCopyScene): void => {
      stand(s);
      captionEl.textContent = captionText(s.caption);
    };

    // ── 운동 ─────────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 그러니 운동은 출발
    // 자리로 **물렸다가** 되돌아오는 꼴이 된다. 물리는 일은 `stand` 직후 아직
    // 어떤 기다림도 지나지 않은 동안 하므로 첫 프레임에 끝 자리가 번쩍이지 않는다.

    /** 막힌 값이 내려와 없는 칸을 파고들다 튕겨 나와 줄 위에서 기다린다. */
    const runBlocked = async (m: Extract<GrowMark, { kind: 'blocked' }>): Promise<void> => {
      const block = oldB;
      const chip = parked;
      if (!block || !chip) return;

      const ghostX = OLD_X + m.slotIndex * PITCH;
      const ghost = node('rect', {
        x: ghostX,
        y: ROW_Y,
        width: CELL_W,
        height: CELL_H,
        rx: 4,
      });
      ghost.setAttribute('fill', 'none');
      ghost.setAttribute('stroke', colors.danger);
      ghost.setAttribute('stroke-width', '1.5');
      ghost.setAttribute('stroke-dasharray', '4 4');
      ghost.style.opacity = '0';
      ghost.style.transition = 'opacity 200ms linear';
      svg.insertBefore(ghost, chipLayer);

      // 출발 자리로 물린다 — 칩은 이미 기다리는 자리에 서 있다.
      chip.style.transform = tf(PARK_X, DROP_IN_Y);

      await glide(chip, tf(PARK_X, PARK_Y), T_DROP_IN, EASE_OUT);
      ghost.style.opacity = '1';
      await glide(chip, tf(ghostX, ROW_Y), T_BUMP, EASE_IN);

      // 벽에 부딪혔다 — 들어갈 자리가 없다.
      const chipRect = chip.firstElementChild;
      if (chipRect) {
        chipRect.setAttribute('fill', colors.danger);
        chipRect.setAttribute('stroke', colors.danger);
      }
      for (const cell of block.cells) cell.rect.setAttribute('stroke', colors.danger);
      await wait(T_HOLD);

      await glide(chip, tf(PARK_X, PARK_Y), T_BOUNCE, EASE_OUT);
    };

    /** 더 큰 자리가 오른쪽으로 펼쳐진다. */
    const runAllocated = async (): Promise<void> => {
      const block = newB;
      if (!block) return;
      // 펼쳐지기 전으로 물린다.
      block.cellsG.style.transform = tf(0, 0, 0.02, 1);
      block.metaG.style.transform = tf(0, 12);
      block.metaG.style.opacity = '0';

      // 둘을 함께 기다린다. render 가 돌려주는 Promise 는 그 장면이 다 선 뒤에
      // 풀려야 하므로 (S-scene), 하나를 던져 두면 계약상 먼저 풀릴 수 있다.
      await Promise.all([
        glide(block.metaG, tf(0, 0), T_UNROLL, EASE_OUT, 1),
        glide(block.cellsG, tf(0, 0, 1, 1), T_UNROLL, EASE_OUT),
      ]);
    };

    /** 값 하나가 옛 칸에서 새 칸으로 건너간다. 원본은 남아 어두워진다. */
    const runCopied = async (m: Extract<GrowMark, { kind: 'copied' }>): Promise<void> => {
      const from = oldB;
      const to = newB;
      if (!from || !to) return;
      const src = from.cells[m.index];
      const dst = to.cells[m.index];
      if (!src || !dst) return;

      // 건너기 전으로 물린다 — 원본은 아직 밝고 새 칸은 아직 비었다.
      paintCell(src, 'active', m.value);
      paintCell(dst, 'active');

      const fromX = from.x + m.index * PITCH;
      const toX = to.x + m.index * PITCH;
      const chip = makeChip(m.value, fromX, ROW_Y);
      chipLayer.appendChild(chip);

      await glide(chip, tf((fromX + toX) / 2, ROW_Y - ARC_LIFT), T_ARC, EASE_OUT);
      paintCell(src, 'copied', m.value);
      await glide(chip, tf(toX, ROW_Y), T_ARC, EASE_IN);
    };

    /**
     * 옛 자리를 버린다 — 옛 블록이 아래로 떨어지고 새 블록이 가운데로 미끄러진다.
     *
     * 이 장면에는 옛 블록이 없다. 표식이 실어 온 `gone` 으로 출발 그림을 셈으로
     * 복원한다 (S-scene — `prev` 는 그리기 재료가 아니다).
     */
    const runFreed = async (
      s: GrowAndCopyScene,
      m: Extract<GrowMark, { kind: 'freed' }>,
    ): Promise<void> => {
      const block = newB;
      if (!block || !s.newBlock) return;

      // 버려지는 블록은 칸이 모두 흐려지되 값은 남는다 — 무엇을 두고 가는지가
      // 보여야 하기 때문이다.
      const dying = buildBlock(m.gone, OLD_X, () => 'released');
      dying.addr.setAttribute('fill', colors.textMuted);
      svg.insertBefore(dying.root, block.root);

      // 미끄러지기 전으로 물린다 — 새 블록은 아직 옛 블록 오른쪽이다.
      block.root.style.transform = tf(besideX(m.gone.capacity), 0);

      await glide(dying.root, tf(OLD_X, DROP_Y), T_RELEASE, EASE_IN, 0);
      dying.root.remove();
      await glide(block.root, tf(centeredX(s.newBlock.capacity), 0), T_SLIDE, EASE_BOTH);
    };

    /** 기다리던 값이 새 블록의 빈 칸으로 내려앉는다. */
    const runAppended = async (m: Extract<GrowMark, { kind: 'appended' }>): Promise<void> => {
      const block = newB;
      if (!block) return;
      const dst = block.cells[m.index];
      if (!dst) return;

      // 앉기 전으로 물린다 — 칸은 아직 비었고 값은 줄 위에 있다.
      paintCell(dst, 'active');
      const chip = makeChip(m.value, PARK_X, PARK_Y);
      chipLayer.appendChild(chip);

      await glide(chip, tf(block.x + m.index * PITCH, ROW_Y), T_LAND, EASE_OUT);
    };

    /**
     * 이번 걸음에 흐르게 할 것을 고른다.
     *
     * `prev` 는 여기서만 쓴다 — 그리기 재료가 아니라 **이 운동이 말이 되는
     * 걸음이었나**를 가리는 잣대다. 띠가 걸음을 건너뛰면 잣대가 전부 거짓이 되어
     * 저절로 걸러진다 (걸음 7 에서 3 으로 뛰면 `prev` 는 7 의 장면이다).
     */
    const flow = async (
      next: GrowAndCopyScene,
      prev: GrowAndCopyScene | null,
    ): Promise<boolean> => {
      const m = next.mark;
      if (!m || prev === null) return false;

      switch (m.kind) {
        case 'blocked':
          if (prev.pending !== null || prev.newBlock !== null) return false;
          await runBlocked(m);
          return true;
        case 'allocated':
          if (prev.newBlock !== null) return false;
          await runAllocated();
          return true;
        case 'copied':
          if (prev.copied !== next.copied - 1 || prev.newBlock === null) return false;
          await runCopied(m);
          return true;
        case 'freed':
          if (prev.oldBlock === null) return false;
          await runFreed(next, m);
          return true;
        case 'appended':
          if (prev.pending === null) return false;
          await runAppended(m);
          return true;
      }
    };

    /**
     * 장면 하나를 그린다.
     *
     * 정적으로 세우는 것이 먼저다. 흐르게 하는 것은 그 위에 덧대고, 되짚기
     * (`animate` 가 거짓) 는 덧대지 않는다 — 지나온 걸음을 되밟을 까닭이 없고,
     * 되밟으면 그 운동이 되짚기보다 오래 남아 화면이 흔들린다.
     *
     * 운동이 끝나면 그 장면을 **다시 한 번 통째로** 세운다. 흐르며 남은 전환 속성
     * 하나가 곧바로 세운 화면과의 차이가 되어 되짚기 판정을 어긋나게 하기 때문이다
     * (프로토콜 4절). 사이에 타이머도 프레임도 없어 같은 그림이 다시 그려질 뿐이다.
     */
    async function render(
      next: GrowAndCopyScene,
      prev: GrowAndCopyScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      settle(next);
      if (!opts.animate || destroyed) return;
      const ran = await flow(next, prev);
      if (ran && !destroyed) settle(next);
    }

    const instance: GrowAndCopyStage = {
      render,

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id); // 걸어 둔 것을 먼저 거두고
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake(); // 기다리던 것을 깨운다
        waiters.clear();
        if (root.parentElement) root.remove();
      },
    };

    return instance;
  },
};
