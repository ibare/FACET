/**
 * shift-on-insert-stage — "가운데에 넣으면 뒤가 밀린다" 를 그리는 조각 전용 view.
 *
 * ── 왜 이 배치인가
 *
 * 동사가 "밀린다" 이므로 화면의 주된 사건은 **가로 이동** 이어야 한다. 그래서
 * 칸(주소)과 값(내용)을 분리해 그린다 —
 *
 *   · 칸은 고정된 여섯 개의 테두리다. 배열의 칸은 어디로도 가지 않는다.
 *   · 값은 칸 위에 얹힌 별개의 타일이고, 밀 때 **실제로 오른쪽으로 translate** 된다.
 *   · 값이 떠난 칸은 즉시 점선(빈 칸)이 된다. "자리가 비었다" 가 눈에 보여야
 *     "자리를 비운 다음에야 새 값이 들어온다" 가 성립한다.
 *
 * 새 값은 목표 칸 **위에** 떠서 기다린다. 들어가는 운동만 세로축(낙하)으로 두어
 * 미는 운동(가로)과 섞이지 않게 했다. 밀기가 끝나 칸이 비기 전에는 내려오지
 * 않으며, 처음에 한 번 부딪혀 튕겨 오르는 것으로 "지금은 못 들어간다" 를 말한다.
 *
 * 색은 design-tokens 만 쓴다 (S-view). 움직이는 값 = itemActive, 새로 넣는 값 =
 * accent, 빈 칸 = ghostOutline 점선, 받을 자리 = accent 점선.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  lightColors,
  makeTranslator,
  type Palette,
  type View,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 268;

const SLOT_W = 74;
const SLOT_GAP = 10;
const SLOT_H = 52;
const ROW_Y = 118;

const TILE_INSET = 5;
const TILE_W = SLOT_W - TILE_INSET * 2;
const TILE_H = SLOT_H - TILE_INSET * 2;
const TILE_Y = ROW_Y + TILE_INSET;

/** 새 값이 들어가기 전에 떠서 기다리는 높이. */
const HOVER_Y = 34;

const INDEX_LABEL_Y = ROW_Y + SLOT_H + 18;
const COUNTER_Y = 58;
const CAPTION_Y = 218;
const NOTE_Y = 246;

/** 한 칸 미는 데 걸리는 시간. */
const MOVE_MS = 360;
/** 받을 자리를 먼저 보여 주는 시간 — 비었음을 확인하고 나서 옮긴다. */
const OPEN_MS = 150;
/** 새 값이 칸으로 떨어지는 시간. */
const DROP_MS = 320;
/** 못 들어가고 튕기는 시간 (한 방향). */
const BUMP_MS = 170;

type SlotState = 'filled' | 'empty' | 'blocked' | 'open' | 'settled';
type TileKind = 'resting' | 'moving' | 'incoming';

type Tile = {
  g: SVGGElement;
  box: SVGRectElement;
  label: SVGTextElement;
};

export type ShiftStageData = {
  values: number[];
  capacity: number;
  targetIndex: number;
  incoming: number;
};

export const shiftOnInsertStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.style.display = 'block';
    svg.style.maxWidth = `${W}px`;
    svg.style.margin = '0 auto';
    svg.style.fontFamily = fonts.body;
    container.appendChild(svg);

    // ── 시간 관리. reset 이 애니메이션 도중에 들어와도 걸린 promise 를 풀어 주고,
    //    세대(gen) 가 바뀐 뒤의 뒷처리는 화면에 손대지 않는다.
    const timers = new Map<ReturnType<typeof setTimeout>, () => void>();
    let gen = 0;

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        const id = setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.set(id, resolve);
      });

    const flushTimers = (): void => {
      for (const [id, resolve] of timers) {
        clearTimeout(id);
        resolve();
      }
      timers.clear();
    };

    // ── 현재 장면의 요소들.
    let slotEls: SVGRectElement[] = [];
    let tiles: (Tile | null)[] = [];
    let incomingTile: Tile | null = null;
    let arrow: SVGGElement | null = null;
    let originX = 0;
    let captionEl: SVGTextElement | null = null;
    let counterEl: SVGTextElement | null = null;

    const slotX = (i: number): number => originX + i * (SLOT_W + SLOT_GAP);
    const tileX = (i: number): number => slotX(i) + TILE_INSET;

    const text = (
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end',
    ): SVGTextElement => {
      const el = document.createElementNS(SVG_NS, 'text');
      el.setAttribute('x', String(x));
      el.setAttribute('y', String(y));
      el.setAttribute('text-anchor', anchor);
      el.setAttribute('font-size', size);
      el.setAttribute('fill', fill);
      return el;
    };

    const paintSlot = (i: number, state: SlotState): void => {
      const r = slotEls[i];
      if (!r) return;
      switch (state) {
        case 'filled':
          r.setAttribute('fill', colors.bgSubtle);
          r.setAttribute('stroke', colors.border);
          r.setAttribute('stroke-width', '1.5');
          r.removeAttribute('stroke-dasharray');
          break;
        case 'empty':
          r.setAttribute('fill', colors.bg);
          r.setAttribute('stroke', colors.ghostOutline);
          r.setAttribute('stroke-width', '1.5');
          r.setAttribute('stroke-dasharray', '5 4');
          break;
        case 'blocked':
          // 넣고 싶은 자리인데 값이 들어 있다.
          r.setAttribute('fill', colors.bgSubtle);
          r.setAttribute('stroke', colors.accent);
          r.setAttribute('stroke-width', '2.5');
          r.removeAttribute('stroke-dasharray');
          break;
        case 'open':
          // 지금 받을 수 있는 빈 자리.
          r.setAttribute('fill', colors.bg);
          r.setAttribute('stroke', colors.accent);
          r.setAttribute('stroke-width', '2.5');
          r.setAttribute('stroke-dasharray', '5 4');
          break;
        case 'settled':
          r.setAttribute('fill', colors.bgSubtle);
          r.setAttribute('stroke', colors.text);
          r.setAttribute('stroke-width', '1.5');
          r.removeAttribute('stroke-dasharray');
          break;
      }
    };

    const paintTile = (tile: Tile, kind: TileKind): void => {
      switch (kind) {
        case 'resting':
          tile.box.setAttribute('fill', colors.itemDefault);
          tile.box.setAttribute('stroke', colors.border);
          tile.label.setAttribute('fill', colors.text);
          break;
        case 'moving':
          tile.box.setAttribute('fill', colors.itemActive);
          tile.box.setAttribute('stroke', colors.itemActive);
          // 색 있는 타일 위 글자는 테마와 무관하게 어두워야 읽힌다.
          tile.label.setAttribute('fill', lightColors.text);
          break;
        case 'incoming':
          tile.box.setAttribute('fill', colors.accent);
          tile.box.setAttribute('stroke', colors.accent);
          tile.label.setAttribute('fill', lightColors.text);
          break;
      }
    };

    const makeTile = (value: number, x: number, y: number, kind: TileKind): Tile => {
      const g = document.createElementNS(SVG_NS, 'g');
      g.style.transform = `translate(${x}px, ${y}px)`;

      const box = document.createElementNS(SVG_NS, 'rect');
      box.setAttribute('width', String(TILE_W));
      box.setAttribute('height', String(TILE_H));
      box.setAttribute('rx', '4');
      box.setAttribute('stroke-width', '1.5');
      g.appendChild(box);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(TILE_W / 2));
      label.setAttribute('y', String(TILE_H / 2 + 6));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', fontSizes.lg);
      label.setAttribute('font-family', fonts.mono);
      label.setAttribute('font-weight', '600');
      // 값 표기는 표식이다 (C10 결정 트리 3) — 키를 만들지 않는다.
      label.textContent = String(value);
      g.appendChild(label);

      const tile: Tile = { g, box, label };
      paintTile(tile, kind);
      return tile;
    };

    const moveTile = (tile: Tile, x: number, y: number, ms: number, easing: string): void => {
      tile.g.style.transition = `transform ${ms}ms ${easing}`;
      tile.g.style.transform = `translate(${x}px, ${y}px)`;
    };

    const setCaption = (value: string): void => {
      if (captionEl) captionEl.textContent = value;
    };

    const setCounter = (moves: number): void => {
      if (counterEl) counterEl.textContent = tr('label.moveCount', 'moved: {n}', { n: moves });
    };

    const build = (data: ShiftStageData): void => {
      flushTimers();
      gen += 1;
      svg.textContent = '';
      slotEls = [];
      tiles = new Array<Tile | null>(data.capacity).fill(null);
      incomingTile = null;

      const rowW = data.capacity * SLOT_W + (data.capacity - 1) * SLOT_GAP;
      originX = Math.round((W - rowW) / 2);

      // 칸 — 고정된 주소. 이것들은 절대 움직이지 않는다.
      const slotLayer = document.createElementNS(SVG_NS, 'g');
      svg.appendChild(slotLayer);
      for (let i = 0; i < data.capacity; i += 1) {
        const r = document.createElementNS(SVG_NS, 'rect');
        r.setAttribute('x', String(slotX(i)));
        r.setAttribute('y', String(ROW_Y));
        r.setAttribute('width', String(SLOT_W));
        r.setAttribute('height', String(SLOT_H));
        r.setAttribute('rx', '6');
        slotLayer.appendChild(r);
        slotEls.push(r);

        // 인덱스 숫자는 표식이다.
        const idx = text(slotX(i) + SLOT_W / 2, INDEX_LABEL_Y, fontSizes.sm, colors.textMuted, 'middle');
        idx.setAttribute('font-family', fonts.mono);
        idx.textContent = String(i);
        slotLayer.appendChild(idx);

        paintSlot(i, i < data.values.length ? 'filled' : 'empty');
      }

      // 새 값이 내려올 길 — 목표 칸 바로 위의 점선과 화살촉.
      arrow = document.createElementNS(SVG_NS, 'g');
      const cx = slotX(data.targetIndex) + SLOT_W / 2;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(cx));
      line.setAttribute('y1', String(HOVER_Y + TILE_H + 8));
      line.setAttribute('x2', String(cx));
      line.setAttribute('y2', String(ROW_Y - 14));
      line.setAttribute('stroke', colors.accent);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '4 4');
      arrow.appendChild(line);
      const head = document.createElementNS(SVG_NS, 'polygon');
      head.setAttribute(
        'points',
        `${cx - 6},${ROW_Y - 14} ${cx + 6},${ROW_Y - 14} ${cx},${ROW_Y - 4}`,
      );
      head.setAttribute('fill', colors.accent);
      arrow.appendChild(head);
      svg.appendChild(arrow);

      // 값 — 칸 위에 얹힌 별개의 물건. 미는 것은 이쪽이다.
      const tileLayer = document.createElementNS(SVG_NS, 'g');
      svg.appendChild(tileLayer);
      for (let i = 0; i < data.values.length; i += 1) {
        const tile = makeTile(data.values[i], tileX(i), TILE_Y, 'resting');
        tileLayer.appendChild(tile.g);
        tiles[i] = tile;
      }

      incomingTile = makeTile(data.incoming, tileX(data.targetIndex), HOVER_Y, 'incoming');
      tileLayer.appendChild(incomingTile.g);

      counterEl = text(originX, COUNTER_Y, fontSizes.sm, colors.textMuted, 'start');
      counterEl.setAttribute('font-family', fonts.mono);
      svg.appendChild(counterEl);
      setCounter(0);

      captionEl = text(W / 2, CAPTION_Y, fontSizes.md, colors.text, 'middle');
      svg.appendChild(captionEl);
      setCaption('');

      // 전제를 감추지 않는다 (S-piece).
      const note = text(W / 2, NOTE_Y, fontSizes.xs, colors.textMuted, 'middle');
      note.textContent = tr(
        'label.note',
        'Capacity 6 with one free slot at the end. A full array must grow first.',
      );
      svg.appendChild(note);
    };

    return {
      destroy() {
        flushTimers();
        gen += 1;
        if (svg.parentElement) svg.remove();
      },

      init(data: ShiftStageData) {
        build(data);
      },

      /** 문제 — 넣고 싶은 자리가 이미 차 있다. 새 값이 부딪혔다가 튕겨 오른다. */
      async planInsert(p: { targetIndex: number; caption: string }): Promise<void> {
        const myGen = gen;
        setCaption(p.caption);
        paintSlot(p.targetIndex, 'blocked');
        const tile = incomingTile;
        if (!tile) return;
        moveTile(tile, tileX(p.targetIndex), HOVER_Y + 16, BUMP_MS, 'ease-in');
        await wait(BUMP_MS);
        if (myGen !== gen) return;
        moveTile(tile, tileX(p.targetIndex), HOVER_Y, BUMP_MS, 'ease-out');
        await wait(BUMP_MS);
      },

      /** 장치 — 뒤에서부터 한 칸씩. 받을 자리를 먼저 보이고 나서 옮긴다. */
      async shiftCell(p: {
        from: number;
        to: number;
        moves: number;
        caption: string;
      }): Promise<void> {
        const myGen = gen;
        setCaption(p.caption);
        setCounter(p.moves);
        paintSlot(p.to, 'open');
        await wait(OPEN_MS);
        if (myGen !== gen) return;

        const tile = tiles[p.from];
        if (tile) {
          paintTile(tile, 'moving');
          moveTile(tile, tileX(p.to), TILE_Y, MOVE_MS, 'cubic-bezier(.4,0,.2,1)');
          await wait(MOVE_MS);
          if (myGen !== gen) return;
          paintTile(tile, 'resting');
          tiles[p.to] = tile;
          tiles[p.from] = null;
        }
        paintSlot(p.to, 'filled');
        // 떠난 자리는 즉시 빈 칸이 된다 — "자리를 비운다" 가 눈에 보여야 한다.
        paintSlot(p.from, 'empty');
      },

      /** 자리가 비었다. 새 값은 이제야 들어갈 수 있다. */
      clearSlot(p: { index: number; caption: string }) {
        setCaption(p.caption);
        paintSlot(p.index, 'open');
      },

      /** 비워 둔 칸으로 새 값이 내려앉는다. */
      async placeValue(p: { index: number; caption: string }): Promise<void> {
        const myGen = gen;
        setCaption(p.caption);
        if (arrow) arrow.setAttribute('opacity', '0');
        const tile = incomingTile;
        if (!tile) return;
        moveTile(tile, tileX(p.index), TILE_Y, DROP_MS, 'cubic-bezier(.34,1.3,.64,1)');
        await wait(DROP_MS);
        if (myGen !== gen) return;
        tiles[p.index] = tile;
        incomingTile = null;
        paintSlot(p.index, 'filled');
      },

      /** 결과 — 자리는 그대로인데 값들이 한 칸씩 옮겨 앉았다. */
      finish(p: { moves: number; caption: string }) {
        setCaption(p.caption);
        setCounter(p.moves);
        for (let i = 0; i < tiles.length; i += 1) {
          if (tiles[i]) paintSlot(i, 'settled');
        }
      },
    };
  },
};
