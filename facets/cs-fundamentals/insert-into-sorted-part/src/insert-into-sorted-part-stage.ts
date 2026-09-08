/**
 * 정렬부 삽입 무대 — 들려 있다가 내려앉는 그림.
 *
 * 화면은 세로로 두 층이다. **아래는 줄**(칸 네 개), **위는 허공**. 새 값은
 * 마지막 칸에서 뽑혀 허공으로 올라가고, 그동안 그 칸은 빈자리가 된다. 견줌에서
 * 진 값이 오른쪽 빈자리로 비켜설 때마다 빈자리는 한 칸씩 왼쪽으로 옮겨 오고,
 * 허공의 값은 **언제나 빈자리 바로 위**에 머문다 — 지금 내려앉으면 어디로 갈지가
 * 매 순간 보이게 하려는 것이다. 경계를 만나면 그 자리에서 수직으로 내려앉는다.
 *
 * 그래서 이 무대의 운동은 셋뿐이다: **올라감 · 오른쪽으로 비켜섬(허공의 값은
 * 왼쪽으로 따라감) · 내려앉음.** 색은 그 운동을 거드는 표시일 뿐이다.
 *
 * 칸은 슬롯(고정)과 타일(움직이는 값)로 나뉘어 있다. 빈자리가 점선 슬롯으로
 * 남는 것이 "자리는 저절로 벌어지지 않는다" 는 이 조각의 요점이다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view) — 칸 수가 무엇이든 두 층 + 캡션 한 줄로
 * 담기므로 viewBox 를 다시 잴 일이 없다.
 *
 * 타이머: 애니메이션 지속시간을 재는 유한 setTimeout 만 쓰고, 스스로 다음 회차를
 * 예약하는 루프는 없다. `destroy()` 가 대기 중인 것을 모두 깨워 해제하므로
 * (algorithm 이 emit 을 await 하는 중이면 영영 잠들 수 있다) 뒷일이 남지 않는다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 240;

/** 칸 폭의 상한. 실제 폭은 캔버스에서 역산한다 (S-piece). */
const CELL_MAX_W = 120;
/** 줄 양옆에 최소한 남겨 둘 여백. */
const SIDE_MIN = 26;
/** 슬롯 안에서 타일이 물러앉는 정도. 이 틈이 칸과 값을 갈라 보이게 한다. */
const TILE_INSET = 7;

const CELL_H = 56;
const ROW_Y = 120;
const HOVER_Y = 22;
const BAND_Y = 186;
const BAND_H = 7;
const CAPTION_Y = 220;
const WALL_W = 5;

const LIFT_MS = 400;
const SLIDE_MS = 360;
const LINK_MS = 200;
const SETTLE_MS = 400;
const WALL_MS = 160;

const EASE_RISE = 'cubic-bezier(0.2, 0.7, 0.3, 1)';
const EASE_SLIDE = 'cubic-bezier(0.35, 0.65, 0.25, 1)';
const EASE_FALL = 'cubic-bezier(0.5, 0, 0.55, 1)';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 움직이는 값 하나. 슬롯은 제자리에 있고 이것만 옮겨 다닌다. */
type Tile = {
  g: SVGGElement;
  box: SVGRectElement;
  label: SVGTextElement;
  value: number;
};

/**
 * 타일의 처지.
 *   plain    줄 안에 얌전히 있는 값
 *   key      들어가려는 새 값. 들리기 전에도 들린 동안에도 이 색이다
 *   probe    지금 견주고 있는 값
 *   settled  더 움직이지 않기로 확정된 값
 */
type TileState = 'plain' | 'key' | 'probe' | 'settled';

export const insertIntoSortedPartStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;

    // 러너가 캔버스를 컨테이너에 먼저 붙이고 mount 를 부른다. 컨테이너를 비우면
    // 이 캔버스가 떨어져 나가므로 건드리지 않고 안쪽에만 그린다 (S-view).
    const root = el('g');
    svg.appendChild(root);

    const slotLayer = el('g');
    const bandLayer = el('g');
    const wallLayer = el('g');
    const linkLayer = el('g');
    const tileLayer = el('g');
    root.appendChild(bandLayer);
    root.appendChild(slotLayer);
    root.appendChild(wallLayer);
    root.appendChild(linkLayer);
    root.appendChild(tileLayer);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.appendChild(caption);

    // ── 타이머. 유한 대기만 있고 재예약 루프는 없다.
    let destroyed = false;
    const pending = new Set<() => void>();
    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const finish = (): void => {
          pending.delete(finish);
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(finish, ms);
        pending.add(finish);
      });

    // ── 배치. 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다.
    let cells: number[] = [];
    let keyIndex = 0;
    let cellW = CELL_MAX_W;
    let tileW = CELL_MAX_W - TILE_INSET * 2;
    let originX = 0;

    const slotX = (i: number): number => originX + i * cellW;
    const tileX = (i: number): number => slotX(i) + TILE_INSET;

    // ── 무대 상태
    const slots: SVGRectElement[] = [];
    const inSlot: Array<Tile | null> = [];
    let keyTile: Tile | null = null;
    let keySettled = false;
    let band: SVGRectElement | null = null;
    let wall: SVGRectElement | null = null;
    let link: SVGLineElement | null = null;

    function paint(tile: Tile, state: TileState): void {
      const skin: Record<TileState, { fill: string; stroke: string; ink: string }> = {
        plain: { fill: c.itemDefault, stroke: c.border, ink: c.text },
        key: { fill: c.accent, stroke: c.accent, ink: c.stateInk },
        probe: { fill: c.itemComparing, stroke: c.itemComparing, ink: c.stateInk },
        settled: { fill: c.itemSorted, stroke: c.itemSorted, ink: c.textInverse },
      };
      const s = skin[state];
      tile.box.setAttribute('fill', s.fill);
      tile.box.setAttribute('stroke', s.stroke);
      tile.label.setAttribute('fill', s.ink);
    }

    function makeTile(value: number): Tile {
      const g = el('g');
      const box = el('rect', {
        x: 0,
        y: 0,
        width: tileW,
        height: CELL_H,
        rx: 7,
        'stroke-width': 1.6,
      });
      const label = el('text', {
        x: tileW / 2,
        y: CELL_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
      });
      label.textContent = String(value);
      g.appendChild(box);
      g.appendChild(label);
      tileLayer.appendChild(g);
      return { g, box, label, value };
    }

    /** 지금 줄이 서 있는 구간의 오른쪽 끝. 들린 값은 아직 줄의 일원이 아니다. */
    function sortedEnd(): number {
      let end = -1;
      for (let i = 0; i < inSlot.length; i += 1) {
        const tile = inSlot[i];
        if (!tile) continue;
        if (tile === keyTile && !keySettled) continue;
        end = i;
      }
      return end;
    }

    function refreshBand(): void {
      if (!band) return;
      const end = sortedEnd();
      if (end < 0) {
        band.setAttribute('width', '0');
        return;
      }
      band.setAttribute('x', String(slotX(0) + 4));
      band.setAttribute('width', String(slotX(end) + cellW - 4 - (slotX(0) + 4)));
    }

    function refreshSlots(): void {
      for (let i = 0; i < slots.length; i += 1) {
        const empty = inSlot[i] === null;
        const s = slots[i];
        s.setAttribute('fill', empty ? c.bg : c.bgSubtle);
        s.setAttribute('stroke', empty ? c.ghostOutline : c.border);
        s.setAttribute('stroke-width', empty ? '2' : '1.2');
        s.setAttribute('stroke-dasharray', empty ? '7 5' : '3 4');
      }
    }

    function clearLink(): void {
      if (!link) return;
      link.remove();
      link = null;
    }

    function clearWall(): void {
      if (!wall) return;
      wall.remove();
      wall = null;
    }

    function build(nextCells: number[], nextKeyIndex: number): void {
      cells = [...nextCells];
      keyIndex = nextKeyIndex;
      keySettled = false;

      const count = Math.max(1, cells.length);
      cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / count));
      tileW = cellW - TILE_INSET * 2;
      originX = Math.round((W - count * cellW) / 2);

      slotLayer.textContent = '';
      bandLayer.textContent = '';
      wallLayer.textContent = '';
      linkLayer.textContent = '';
      tileLayer.textContent = '';
      slots.length = 0;
      inSlot.length = 0;
      wall = null;
      link = null;

      band = el('rect', {
        x: slotX(0) + 4,
        y: BAND_Y,
        width: 0,
        height: BAND_H,
        rx: BAND_H / 2,
        fill: c.sortedTailBg,
        stroke: c.sortedTailBorder,
        'stroke-width': 1,
      });
      bandLayer.appendChild(band);

      for (let i = 0; i < cells.length; i += 1) {
        const slot = el('rect', {
          x: slotX(i) + 4,
          y: ROW_Y - 3,
          width: cellW - 8,
          height: CELL_H + 6,
          rx: 9,
        });
        slotLayer.appendChild(slot);
        slots.push(slot);

        const tile = makeTile(cells[i]);
        tile.g.setAttribute('transform', `translate(${tileX(i)}, ${ROW_Y})`);
        inSlot.push(tile);
        paint(tile, i === keyIndex ? 'key' : 'plain');
        if (i === keyIndex) keyTile = tile;
      }

      refreshSlots();
      refreshBand();
    }

    async function move(tile: Tile, x: number, y: number, ms: number, ease: string): Promise<void> {
      tile.g.style.transition = `transform ${ms}ms ${ease}`;
      tile.g.setAttribute('transform', `translate(${x}, ${y})`);
      await wait(ms);
      tile.g.style.transition = '';
    }

    return {
      /** 줄과 새 값을 세운다. `cells` 의 마지막 칸이 새 값의 출발 자리다. */
      init(nextCells: number[], nextKeyIndex: number): void {
        build(nextCells, nextKeyIndex);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 새 값이 칸에서 뽑혀 허공으로 오른다. 그 칸은 빈자리가 된다. */
      async lift(index: number): Promise<void> {
        const tile = inSlot[index];
        if (!tile) return;
        inSlot[index] = null;
        refreshSlots();
        refreshBand();
        await move(tile, tileX(index), HOVER_Y, LIFT_MS, EASE_RISE);
      },

      /** 허공의 값과 빈자리 왼쪽 칸을 잇는 견줌 선을 긋는다. */
      async compare(holeIndex: number, probeIndex: number): Promise<void> {
        const tile = inSlot[probeIndex];
        if (tile) paint(tile, 'probe');

        clearLink();
        const x1 = tileX(holeIndex) + tileW * 0.22;
        const y1 = HOVER_Y + CELL_H;
        const x2 = tileX(probeIndex) + tileW * 0.78;
        const y2 = ROW_Y;
        const len = Math.round(Math.hypot(x2 - x1, y2 - y1));
        link = el('line', {
          x1,
          y1,
          x2,
          y2,
          stroke: c.itemComparing,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
          'stroke-dasharray': len,
          'stroke-dashoffset': len,
        });
        linkLayer.appendChild(link);
        link.style.transition = `stroke-dashoffset ${LINK_MS}ms linear`;
        link.setAttribute('stroke-dashoffset', '0');
        await wait(LINK_MS);
      },

      /**
       * 견줌에 진 값이 오른쪽 빈자리로 비켜서고, 허공의 값이 새 빈자리 위로
       * 따라 옮겨 온다. 둘은 같은 순간에 움직인다 — 빈자리가 옮겨 오는 일과
       * 값이 비켜서는 일이 같은 사건이기 때문이다.
       */
      async stepAside(from: number, to: number): Promise<void> {
        const tile = inSlot[from];
        if (!tile) return;
        clearLink();
        inSlot[from] = null;
        inSlot[to] = tile;
        refreshSlots();
        refreshBand();
        await Promise.all([
          move(tile, tileX(to), ROW_Y, SLIDE_MS, EASE_SLIDE),
          keyTile ? move(keyTile, tileX(from), HOVER_Y, SLIDE_MS, EASE_SLIDE) : Promise.resolve(),
        ]);
        paint(tile, 'plain');
      },

      /** 더 왼쪽으로 가지 않는다. 빈자리 왼쪽 모서리에 경계를 세운다. */
      async stop(probeIndex: number, holeIndex: number): Promise<void> {
        clearLink();
        const tile = inSlot[probeIndex];
        if (tile) paint(tile, 'settled');

        clearWall();
        const cx = slotX(holeIndex);
        const cy = ROW_Y + CELL_H / 2;
        wall = el('rect', {
          x: cx - WALL_W / 2,
          y: ROW_Y - 10,
          width: WALL_W,
          height: CELL_H + 20,
          rx: WALL_W / 2,
          fill: c.accent,
        });
        wall.style.transformOrigin = `${cx}px ${cy}px`;
        wall.setAttribute('transform', 'scale(1, 0.15)');
        wallLayer.appendChild(wall);
        wall.style.transition = `transform ${WALL_MS}ms ${EASE_RISE}`;
        wall.setAttribute('transform', 'scale(1, 1)');
        await wait(WALL_MS);
      },

      /** 허공의 값이 빈자리로 곧장 내려앉는다. */
      async settle(index: number): Promise<void> {
        const tile = keyTile;
        if (!tile) return;
        inSlot[index] = tile;
        keySettled = true;
        refreshSlots();
        refreshBand();
        await move(tile, tileX(index), ROW_Y, SETTLE_MS, EASE_FALL);
      },

      /** 줄이 다시 섰다. 새 값만 제 색으로 남겨 어디에 내려앉았는지 보인다. */
      finish(): void {
        clearLink();
        for (const tile of inSlot) {
          if (!tile) continue;
          paint(tile, tile === keyTile ? 'key' : 'settled');
        }
      },

      /** 처음 상태로 되감는다. */
      rewind(): void {
        build(cells, keyIndex);
      },

      destroy(): void {
        destroyed = true;
        // 대기 중인 애니메이션을 깨운다. 남겨 두면 emit 을 await 하던 algorithm 이
        // 영영 잠든 채로 남는다.
        for (const finish of [...pending]) finish();
        pending.clear();
        root.remove();
      },
    };
  },
};
