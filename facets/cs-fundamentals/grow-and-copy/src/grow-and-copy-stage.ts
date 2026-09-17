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
 * ── CSS transition 을 쓰지 않는다
 *
 * 옛 stage 는 `style.transition` 을 걸어 두고 rAF 한 틱 뒤에 목표값을 넣는 짜임이라
 * 세 곳이 그것을 지났다. 되짚기는 `animate:false` 로 오는데 transition 은 그 뒤에도
 * 화면을 저 혼자 흘러가게 하므로, 되짚어 세운 화면이 나중에 저절로 바뀐다 — "그
 * 걸음의 화면" 이라는 말이 서지 않는다 (S-scene MUST NOT). 전부 `tween` 보간으로
 * 옮겼다. 벽시계는 `setTimeout` 으로 재고 rAF 를 쓰지 않는다 — 프레임이 없는 자리
 * 에서도 걸음이 실제로 돌아야 하기 때문이다.
 *
 * 한 걸음 안에서 흐르는 것이 여럿이면 **시계를 나누지 않는다.** 옛 블록이 떨어지고
 * 새 블록이 미끄러져 드는 것은 두 운동이 아니라 "옮겨 담기" 한 뜻이므로, 한 `tween`
 * 안에서 마디마다 어긋난 시각을 줄 뿐이다. 그래야 `render` 의 Promise 도 그 전부가
 * 선 뒤에 구조적으로 풀린다.
 *
 * 흐르게 하는 것은 정적 그리기 위에 덧댄다. 정적 그리기가 정본이므로 운동은 **끝
 * 자리에 서 있는 것을 출발 자리로 물렸다가 되돌리는** 꼴이 되고, 운동이 끝나면 그
 * 장면을 다시 한 번 통째로 세운다 — 붉어진 테두리나 보간의 끝자리 하나가 곧바로
 * 세운 화면과의 차이가 되어 되짚기 판정을 어긋나게 하기 때문이다.
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

/** 새 자리가 펼쳐지기 시작하는 폭의 비율. 0 이면 무엇이 자라는지 안 보인다. */
const UNROLL_FROM = 0.02;
/** 크기 표기가 떠오르는 거리. */
const META_RISE = 12;

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
/** 색이 갈리는 데 드는 시간. 자리 옮김과 겹쳐 흐른다. */
const T_TINT = 200;
/** 보간 한 마디. rAF 가 아니라 벽시계로 잰다. */
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const easeIn = (p: number): number => p ** 3;
const easeBoth = (p: number): number => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

/**
 * 두 색 사이. `p >= 1` 이면 목표 색을 **글자 그대로** 돌려준다 — 보간이 끝났는데
 * `rgb(…)` 가 남으면 정적 그리기가 세운 hex 와 글자가 달라진다.
 */
function mixColor(from: string, to: string, p: number): string {
  if (p >= 1) return to;
  const a = parseHex(from);
  const b = parseHex(to);
  if (a === null || b === null) return to;
  const at = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * p);
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
}

function parseHex(value: string): [number, number, number] | null {
  const raw = value.trim().replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (ch) => ch + ch) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

type CellState = 'empty' | 'filled' | 'active' | 'copied' | 'released';

type Cell = { rect: SVGRectElement; label: SVGTextElement };

type Block = {
  root: SVGGElement;
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

const tf = (x: number, y: number): string => `translate(${x}px, ${y}px)`;

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
    // 보간 promise 는 반드시 `waiters` 로도 풀린다. 러너의 reset 이 실행 중인
    // 알고리즘을 await 하므로, 풀리지 않는 promise 는 곧 잠금이다 (S-piece).
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지난다. `destroy` 나 다음 걸음이 그 가운데 오면
     * 남은 프레임이 이미 갈아 치운 화면에 쓰므로, 프레임마다 자기 번호가 아직
     * 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서
     * 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * `resolve` 를 `waiters` 에 담아 두므로 `destroy` 가 타이머를 취소해도 기다리던
     * 약속이 함께 풀린다 — 콜백 안에만 두면 취소된 tick 이 아예 안 불려 약속이
     * 영영 안 풀린다 (S-piece).
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

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
      return { root: blockRoot, metaG, addr, cells, x, capacity: b.capacity };
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
    const drawStatic = (s: GrowAndCopyScene): void => {
      stand(s);
      captionEl.textContent = captionText(s.caption);
    };

    // ── 운동 ─────────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 그러니 운동은 출발
    // 자리로 **물렸다가** 되돌아오는 꼴이 된다. 물리는 일은 `tween` 의 첫 마디가
    // 곧바로 그리므로 첫 프레임에 끝 자리가 번쩍이지 않는다.

    /**
     * 막힌 값이 내려와 없는 칸을 파고들다 튕겨 나와 줄 위에서 기다린다.
     *
     * 네 마디(내려옴 · 파고듦 · 머묾 · 튕김)가 한 뜻이라 시계를 나누지 않는다.
     */
    const runBlocked = (
      m: Extract<GrowMark, { kind: 'blocked' }>,
      mine: number,
    ): Promise<void> => {
      const block = oldB;
      const chip = parked;
      if (!block || !chip) return Promise.resolve();

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
      ghost.setAttribute('opacity', '0');
      svg.insertBefore(ghost, chipLayer);

      const chipRect = chip.firstElementChild;

      const bumpAt = T_DROP_IN;
      const holdAt = bumpAt + T_BUMP;
      const backAt = holdAt + T_HOLD;
      const total = backAt + T_BOUNCE;

      return tween(total, mine, (p) => {
        const now = p * total;
        const done = p >= 1;

        // 칩의 길. 끝에서는 보간값이 아니라 기다리는 자리를 그대로 쓴다.
        if (done) {
          chip.style.transform = tf(PARK_X, PARK_Y);
        } else if (now < bumpAt) {
          const e = easeOut(clamp01(now / T_DROP_IN));
          chip.style.transform = tf(PARK_X, DROP_IN_Y + (PARK_Y - DROP_IN_Y) * e);
        } else if (now < holdAt) {
          const e = easeIn(clamp01((now - bumpAt) / T_BUMP));
          chip.style.transform = tf(
            PARK_X + (ghostX - PARK_X) * e,
            PARK_Y + (ROW_Y - PARK_Y) * e,
          );
        } else if (now < backAt) {
          chip.style.transform = tf(ghostX, ROW_Y);
        } else {
          const e = easeOut(clamp01((now - backAt) / T_BOUNCE));
          chip.style.transform = tf(
            ghostX + (PARK_X - ghostX) * e,
            ROW_Y + (PARK_Y - ROW_Y) * e,
          );
        }

        // 있지도 않은 다섯째 칸이 점선으로 드러난다.
        const g = done ? 1 : clamp01((now - bumpAt) / T_TINT);
        if (g >= 1) ghost.removeAttribute('opacity');
        else if (g > 0) ghost.setAttribute('opacity', String(g));

        // 벽에 부딪혔다 — 칩도 칸도 붉어진다. 색은 두 색을 직접 섞어 옮긴다.
        const r = done ? 1 : clamp01((now - holdAt) / T_TINT);
        if (r > 0) {
          const hot = mixColor(colors.itemActive, colors.danger, r);
          if (chipRect) {
            chipRect.setAttribute('fill', hot);
            chipRect.setAttribute('stroke', hot);
          }
          const edge = mixColor(colors.border, colors.danger, r);
          for (const cell of block.cells) cell.rect.setAttribute('stroke', edge);
        }
      });
    };

    /**
     * 더 큰 자리가 오른쪽으로 펼쳐진다.
     *
     * `scaleX` 대신 칸의 `x`·`width` 를 바로 보간한다 — 점선 테두리가 찌그러지지
     * 않고, 끝 자리에 배율의 끝자리가 남지 않는다.
     */
    const runAllocated = (mine: number): Promise<void> => {
      const block = newB;
      if (!block) return Promise.resolve();
      const meta = block.metaG;

      return tween(T_UNROLL, mine, (p) => {
        const done = p >= 1;
        const e = done ? 1 : easeOut(p);
        const s = UNROLL_FROM + (1 - UNROLL_FROM) * e;

        block.cells.forEach((cell, i) => {
          if (done) {
            cell.rect.setAttribute('x', String(i * PITCH));
            cell.rect.setAttribute('width', String(CELL_W));
            cell.label.setAttribute('x', String(i * PITCH + CELL_W / 2));
            return;
          }
          cell.rect.setAttribute('x', String(i * PITCH * s));
          cell.rect.setAttribute('width', String(CELL_W * s));
          cell.label.setAttribute('x', String((i * PITCH + CELL_W / 2) * s));
        });

        if (done) {
          meta.style.transform = tf(0, 0);
          meta.style.removeProperty('opacity');
        } else {
          meta.style.transform = tf(0, META_RISE * (1 - e));
          meta.style.opacity = String(e);
        }
      });
    };

    /** 값 하나가 옛 칸에서 새 칸으로 건너간다. 원본은 남아 어두워진다. */
    const runCopied = (
      m: Extract<GrowMark, { kind: 'copied' }>,
      mine: number,
    ): Promise<void> => {
      const from = oldB;
      const to = newB;
      if (!from || !to) return Promise.resolve();
      const src = from.cells[m.index];
      const dst = to.cells[m.index];
      if (!src || !dst) return Promise.resolve();

      // 건너기 전으로 물린다 — 원본은 아직 밝고 새 칸도 갓 앉은 빛이다.
      paintCell(src, 'active', m.value);
      paintCell(dst, 'active');

      const fromX = from.x + m.index * PITCH;
      const toX = to.x + m.index * PITCH;
      const midX = (fromX + toX) / 2;
      const chip = makeChip(m.value, fromX, ROW_Y);
      chipLayer.appendChild(chip);

      const total = T_ARC * 2;
      return tween(total, mine, (p) => {
        const now = p * total;
        const done = p >= 1;

        if (done) {
          chip.style.transform = tf(toX, ROW_Y);
        } else if (now < T_ARC) {
          const e = easeOut(clamp01(now / T_ARC));
          chip.style.transform = tf(fromX + (midX - fromX) * e, ROW_Y - ARC_LIFT * e);
        } else {
          const e = easeIn(clamp01((now - T_ARC) / T_ARC));
          chip.style.transform = tf(midX + (toX - midX) * e, ROW_Y - ARC_LIFT * (1 - e));
        }

        // 마루를 넘는 순간부터 원본이 어두워진다 — 값은 남고 빛만 건너간다.
        const d = done ? 1 : clamp01((now - T_ARC) / T_TINT);
        if (d > 0) {
          const dim = mixColor(colors.itemActive, colors.itemSorted, d);
          src.rect.setAttribute('fill', dim);
          src.rect.setAttribute('stroke', dim);
        }
      });
    };

    /**
     * 옛 자리를 버린다 — 옛 블록이 아래로 떨어지고 새 블록이 가운데로 미끄러진다.
     *
     * 이 장면에는 옛 블록이 없다. 표식이 실어 온 `gone` 으로 출발 그림을 셈으로
     * 복원한다 (S-scene — `prev` 는 그리기 재료가 아니다). 떨어짐과 미끄러짐은 두
     * 운동이 아니라 "옮겨 담기" 한 뜻이라 한 시계로 흐른다.
     */
    const runFreed = (
      s: GrowAndCopyScene,
      m: Extract<GrowMark, { kind: 'freed' }>,
      mine: number,
    ): Promise<void> => {
      const block = newB;
      if (!block || !s.newBlock) return Promise.resolve();

      // 버려지는 블록은 칸이 모두 흐려지되 값은 남는다 — 무엇을 두고 가는지가
      // 보여야 하기 때문이다.
      const dying = buildBlock(m.gone, OLD_X, () => 'released');
      dying.addr.setAttribute('fill', colors.textMuted);
      svg.insertBefore(dying.root, block.root);

      const fromX = besideX(m.gone.capacity);
      const toX = centeredX(s.newBlock.capacity);
      const total = T_RELEASE + T_SLIDE;

      return tween(total, mine, (p) => {
        const now = p * total;
        const done = p >= 1;

        if (!done && now < T_RELEASE) {
          const e = easeIn(clamp01(now / T_RELEASE));
          dying.root.style.transform = tf(OLD_X, DROP_Y * e);
          dying.root.style.opacity = String(1 - e);
        } else if (dying.root.parentNode) {
          // 다 떨어졌다. 노드째 지우므로 보간의 끝자리가 남을 자리가 없다.
          dying.root.remove();
        }

        if (done) {
          block.root.style.transform = tf(toX, 0);
        } else {
          const e = easeBoth(clamp01((now - T_RELEASE) / T_SLIDE));
          block.root.style.transform = tf(fromX + (toX - fromX) * e, 0);
        }
      });
    };

    /** 기다리던 값이 새 블록의 빈 칸으로 내려앉는다. */
    const runAppended = (
      m: Extract<GrowMark, { kind: 'appended' }>,
      mine: number,
    ): Promise<void> => {
      const block = newB;
      if (!block) return Promise.resolve();
      const dst = block.cells[m.index];
      if (!dst) return Promise.resolve();

      // 앉기 전으로 물린다 — 칸은 갓 앉은 빛이고 값은 줄 위에 있다.
      paintCell(dst, 'active');
      const chip = makeChip(m.value, PARK_X, PARK_Y);
      chipLayer.appendChild(chip);
      const toX = block.x + m.index * PITCH;

      return tween(T_LAND, mine, (p) => {
        if (p >= 1) {
          chip.style.transform = tf(toX, ROW_Y);
          return;
        }
        const e = easeOut(p);
        chip.style.transform = tf(PARK_X + (toX - PARK_X) * e, PARK_Y + (ROW_Y - PARK_Y) * e);
      });
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
      mine: number,
    ): Promise<void> => {
      const m = next.mark;
      if (!m || prev === null) return;

      switch (m.kind) {
        case 'blocked':
          if (prev.pending !== null || prev.newBlock !== null) return;
          await runBlocked(m, mine);
          return;
        case 'allocated':
          if (prev.newBlock !== null) return;
          await runAllocated(mine);
          return;
        case 'copied':
          if (prev.copied !== next.copied - 1 || prev.newBlock === null) return;
          await runCopied(m, mine);
          return;
        case 'freed':
          if (prev.oldBlock === null) return;
          await runFreed(next, m, mine);
          return;
        case 'appended':
          if (prev.pending === null) return;
          await runAppended(m, mine);
          return;
      }
    };

    /**
     * 장면 하나를 그린다.
     *
     * 정적으로 세우는 것이 먼저다. 흐르게 하는 것은 그 위에 덧대고, 되짚기
     * (`animate` 가 거짓) 는 덧대지 않는다 — 지나온 걸음을 되밟을 까닭이 없고,
     * 되밟으면 그 운동이 되짚기보다 오래 남아 화면이 흔들린다.
     *
     * 운동이 끝나면 그 장면을 **다시 한 번 통째로** 세운다. 붉어진 테두리 · 어두워진
     * 칸 · 건너간 칩 같은 것이 그대로 남으면 곧바로 세운 화면과 글자가 달라져
     * 되짚기 판정이 어긋난다. 사이에 타이머도 프레임도 없어 같은 그림이 다시 그려질
     * 뿐이다.
     */
    async function render(
      next: GrowAndCopyScene,
      prev: GrowAndCopyScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      drawStatic(next);
      if (!opts.animate || destroyed) return;
      await flow(next, prev, mine);
      if (!alive(mine)) return;
      drawStatic(next);
    }

    const instance: GrowAndCopyStage = {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1; // 살아 있는 보간이 더는 화면에 손대지 못하게 빗장을 올린다
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 콜백은 아예 불리지
        // 않으므로 기다리던 것을 직접 깨워야 `await ctx.emit` 이 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentElement) root.remove();
      },
    };

    return instance;
  },
};
