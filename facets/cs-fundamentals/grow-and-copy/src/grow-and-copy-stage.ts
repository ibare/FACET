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
 *
 * 화면 문자열은 전부 projector 가 `runtime.t` 로 해석해 넘긴다 (C10). 이 파일이
 * 스스로 짓는 문자는 없다 — 칸 안의 숫자와 주소 표기는 데이터 그대로다.
 */

import {
  getColors,
  fonts,
  fontSizes,
  space,
  PIECE_CANVAS_W,
  type View,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

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
  meta: SVGTextElement;
  cells: Cell[];
  x: number;
  capacity: number;
};

export type GrowAndCopyStageInit = {
  /** 옛 블록 주소 표기 (데이터 그대로). */
  address: string;
  /** 옛 블록 용량. */
  capacity: number;
  /** 옛 블록에 든 값. */
  values: number[];
  /** projector 가 해석해 넘긴 크기 표기. */
  meta: string;
  /** projector 가 해석해 넘긴 전제 각주. */
  notes: string[];
};

const tf = (x: number, y: number, sx = 1, sy = 1): string =>
  `translate(${x}px, ${y}px) scale(${sx}, ${sy})`;

export const growAndCopyStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);

    const root = document.createElement('div');
    root.className = 'facet-grow-and-copy';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.alignItems = 'center';
    root.style.gap = space.sm;
    root.style.width = '100%';
    root.style.fontFamily = fonts.body;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = `${W}px`;
    svg.style.display = 'block';
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

    const notesEl = document.createElement('div');
    notesEl.className = 'facet-grow-and-copy__notes';
    notesEl.style.display = 'flex';
    notesEl.style.flexDirection = 'column';
    notesEl.style.gap = space.xs;
    notesEl.style.maxWidth = `${W}px`;
    notesEl.style.textAlign = 'center';
    notesEl.style.fontSize = fontSizes.xs;
    notesEl.style.lineHeight = '1.4';
    notesEl.style.color = colors.textMuted;
    root.appendChild(notesEl);

    container.appendChild(root);

    // ── 시간 관리 ────────────────────────────────────────────────────────
    // 애니메이션 promise 는 반드시 타이머로만 풀린다. 러너의 reset 이
    // 실행 중인 알고리즘을 await 하므로, 풀리지 않는 promise 는 곧 잠금이다.
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const pendingResolves = new Set<() => void>();

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        const settle = (): void => {
          pendingResolves.delete(settle);
          resolve();
        };
        pendingResolves.add(settle);
        const id = setTimeout(() => {
          timers.delete(id);
          settle();
        }, ms);
        timers.add(id);
      });

    const flush = (): void => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const settle of [...pendingResolves]) settle();
    };

    const raf = (fn: () => void): void => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(fn));
      } else {
        fn();
      }
    };

    const animate = (
      el: SVGGElement,
      transform: string,
      ms: number,
      easing: string = EASE_BOTH,
      opacity?: number,
    ): Promise<void> => {
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

    const makeBlock = (opts: {
      x: number;
      capacity: number;
      values: number[];
      address: string;
      meta: string;
    }): Block => {
      const blockRoot = node('g');
      blockRoot.style.transformOrigin = '0 0';
      blockRoot.style.transform = tf(opts.x, 0);

      const cellsG = node('g');
      cellsG.style.transformOrigin = '0 0';
      cellsG.style.transform = tf(0, 0);

      const cells: Cell[] = [];
      for (let i = 0; i < opts.capacity; i += 1) {
        const made = makeCell(i);
        cellsG.appendChild(made.g);
        cells.push(made.cell);
        const v = opts.values[i];
        if (v === undefined) paintCell(made.cell, 'empty');
        else paintCell(made.cell, 'filled', v);
      }

      const metaG = node('g');
      metaG.style.transformOrigin = '0 0';
      metaG.style.transform = tf(0, 0);
      const midX = blockWidth(opts.capacity) / 2;
      const addr = node('text', { x: midX, y: META_ADDR_Y, 'text-anchor': 'middle' });
      addr.style.fontFamily = fonts.mono;
      addr.style.fontSize = fontSizes.sm;
      addr.setAttribute('fill', colors.text);
      addr.textContent = opts.address;
      const meta = node('text', { x: midX, y: META_SIZE_Y, 'text-anchor': 'middle' });
      meta.style.fontFamily = fonts.body;
      meta.style.fontSize = fontSizes.xs;
      meta.setAttribute('fill', colors.textMuted);
      meta.textContent = opts.meta;
      metaG.appendChild(addr);
      metaG.appendChild(meta);

      blockRoot.appendChild(cellsG);
      blockRoot.appendChild(metaG);
      return {
        root: blockRoot,
        cellsG,
        metaG,
        addr,
        meta,
        cells,
        x: opts.x,
        capacity: opts.capacity,
      };
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

    // ── 장면 상태 ────────────────────────────────────────────────────────
    let seed: GrowAndCopyStageInit | null = null;
    let oldBlock: Block | null = null;
    let newBlock: Block | null = null;
    let pendingChip: SVGGElement | null = null;
    let chipLayer: SVGGElement | null = null;

    const build = (data: GrowAndCopyStageInit): void => {
      flush();
      svg.textContent = '';
      newBlock = null;
      pendingChip = null;

      oldBlock = makeBlock({
        x: OLD_X,
        capacity: data.capacity,
        values: data.values,
        address: data.address,
        meta: data.meta,
      });
      svg.appendChild(oldBlock.root);

      chipLayer = node('g');
      svg.appendChild(chipLayer);

      notesEl.textContent = '';
      for (const text of data.notes) {
        const line = document.createElement('div');
        line.textContent = text;
        notesEl.appendChild(line);
      }
    };

    return {
      destroy(): void {
        flush();
        if (root.parentElement) root.remove();
      },

      /** 처음 장면 — 꽉 찬 블록 하나. */
      init(data: GrowAndCopyStageInit): void {
        seed = data;
        build(data);
      },

      /** 되감기 — 처음 장면으로 즉시 되돌린다. */
      rewind(): void {
        if (seed) build(seed);
      },

      setCaption(text: string): void {
        captionEl.textContent = text;
      },

      /**
       * 꽉 찬 블록에 값이 들어오려다 막힌다. 값은 위에서 내려와 "없는 칸"
       * 자리를 파고들다 벽에 부딪히고 튕겨 나와 줄 위에서 기다린다.
       */
      async blockFull(p: { value: number; slotIndex: number }): Promise<void> {
        if (!oldBlock || !chipLayer) return;

        const ghostX = OLD_X + p.slotIndex * PITCH;
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

        const chip = makeChip(p.value, PARK_X, -CELL_H - 12);
        chipLayer.appendChild(chip);
        pendingChip = chip;

        await animate(chip, tf(PARK_X, PARK_Y), T_DROP_IN, EASE_OUT);
        ghost.style.opacity = '1';
        await animate(chip, tf(ghostX, ROW_Y), T_BUMP, EASE_IN);

        // 벽에 부딪혔다 — 들어갈 자리가 없다.
        const chipRect = chip.firstElementChild;
        if (chipRect) {
          chipRect.setAttribute('fill', colors.danger);
          chipRect.setAttribute('stroke', colors.danger);
        }
        for (const cell of oldBlock.cells) {
          cell.rect.setAttribute('stroke', colors.danger);
        }
        await wait(T_HOLD);

        await animate(chip, tf(PARK_X, PARK_Y), T_BOUNCE, EASE_OUT);
        if (chipRect) {
          chipRect.setAttribute('fill', colors.itemActive);
          chipRect.setAttribute('stroke', colors.itemActive);
        }
        for (const cell of oldBlock.cells) {
          cell.rect.setAttribute('stroke', colors.border);
        }
        ghost.style.opacity = '0';
      },

      /** 더 큰 자리를 새로 얻는다 — 오른쪽으로 펼쳐진다. */
      async allocate(p: { address: string; capacity: number; meta: string }): Promise<void> {
        if (!oldBlock || !chipLayer) return;
        const x = OLD_X + blockWidth(oldBlock.capacity) + GROUP_GAP;
        const block = makeBlock({
          x,
          capacity: p.capacity,
          values: [],
          address: p.address,
          meta: p.meta,
        });
        block.cellsG.style.transform = tf(0, 0, 0.02, 1);
        block.metaG.style.transform = tf(0, 12);
        block.metaG.style.opacity = '0';
        svg.insertBefore(block.root, chipLayer);
        newBlock = block;

        void animate(block.metaG, tf(0, 0), T_UNROLL, EASE_OUT, 1);
        await animate(block.cellsG, tf(0, 0, 1, 1), T_UNROLL, EASE_OUT);
      },

      /**
       * 값 하나를 새 자리로 옮긴다. 원본은 남아 "복사됨" 으로 어두워지고,
       * 복제본이 포물선을 그리며 같은 번호의 새 칸으로 날아간다.
       */
      async copyValue(p: { index: number; value: number }): Promise<void> {
        if (!oldBlock || !newBlock || !chipLayer) return;
        const src = oldBlock.cells[p.index];
        const dst = newBlock.cells[p.index];
        if (!src || !dst) return;

        paintCell(src, 'active', p.value);
        paintCell(dst, 'active');

        const fromX = oldBlock.x + p.index * PITCH;
        const toX = newBlock.x + p.index * PITCH;
        const chip = makeChip(p.value, fromX, ROW_Y);
        chipLayer.appendChild(chip);

        await animate(chip, tf((fromX + toX) / 2, ROW_Y - ARC_LIFT), T_ARC, EASE_OUT);
        paintCell(src, 'copied', p.value);
        await animate(chip, tf(toX, ROW_Y), T_ARC, EASE_IN);

        chip.remove();
        paintCell(dst, 'filled', p.value);
      },

      /**
       * 옛 자리를 버린다. 옛 블록은 아래로 떨어져 화면 밖으로 나가고, 새 블록이
       * 가운데로 미끄러져 들어와 그 자리를 대신한다 — 주소가 바뀌었다.
       */
      async releaseOld(): Promise<void> {
        if (!oldBlock || !newBlock) return;
        const dying = oldBlock;
        for (const cell of dying.cells) paintCell(cell, 'released');
        dying.addr.setAttribute('fill', colors.textMuted);
        await animate(dying.root, tf(dying.x, DROP_Y), T_RELEASE, EASE_IN, 0);
        dying.root.remove();
        oldBlock = null;

        const target = centeredX(newBlock.capacity);
        newBlock.x = target;
        await animate(newBlock.root, tf(target, 0), T_SLIDE, EASE_BOTH);
      },

      /** 기다리던 값이 새 블록의 빈 칸으로 내려앉는다. */
      async appendPending(p: { index: number; value: number }): Promise<void> {
        if (!newBlock || !pendingChip) return;
        const dst = newBlock.cells[p.index];
        if (!dst) return;
        paintCell(dst, 'active');
        const toX = newBlock.x + p.index * PITCH;
        await animate(pendingChip, tf(toX, ROW_Y), T_LAND, EASE_OUT);
        pendingChip.remove();
        pendingChip = null;
        paintCell(dst, 'filled', p.value);
      },
    };
  },
};
