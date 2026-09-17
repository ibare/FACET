/**
 * 정렬부 삽입 무대 — 들려 있다가 내려앉는 그림.
 *
 * 화면은 세로로 두 층이다. **아래는 줄**(칸 넷), **위는 허공**. 새 값은 마지막 칸에서
 * 뽑혀 허공으로 올라가고, 그동안 그 칸은 빈자리가 된다. 견줌에서 진 값이 오른쪽
 * 빈자리로 비켜설 때마다 빈자리는 한 칸씩 왼쪽으로 옮겨 오고, 허공의 값은 **언제나
 * 빈자리 바로 위**에 머문다 — 지금 내려앉으면 어디로 갈지가 매 순간 보이게 하려는
 * 것이다. 경계를 만나면 그 자리에서 수직으로 내려앉는다.
 *
 * 그래서 이 무대의 운동은 셋이 아니라 **하나**다. 올라감 · 비켜섬 · 내려앉음이 전부
 * "값이 자리를 옮긴다" 는 한 동사라, 걸음마다 옮길 것을 `Move` 목록 하나에 모아
 * **한 시계**로 흘린다. 비켜섬은 값 둘이 한 걸음에 움직이는데 (진 값은 오른쪽으로,
 * 허공의 값은 왼쪽으로) 그 둘이 곧 "빈자리가 옮겨 온다" 는 한 사건이므로 시계를
 * 나누지 않는다 (S-scene).
 *
 * 칸은 슬롯(고정)과 타일(움직이는 값)로 나뉘어 있다. 빈자리가 점선 슬롯으로 남는
 * 것이 "자리는 저절로 벌어지지 않는다" 는 이 조각의 요점이다.
 *
 * ── 칠은 두 축이다
 *
 * **채움은 값의 형편** — 이 값이 이번 삽입에서 오른쪽으로 비켜섰나(`shifted`),
 * 손대지 않았나(`plain`), 들어오는 새 값인가(`key`). 채움은 타일에 붙으므로 값이
 * 자리를 옮겨도 따라간다.
 *
 * **테두리는 견줌의 표식** — 견주어 보았나, 지금 견주는 중인가. 그리고 **벽**은
 * 걸음이 멈춘 자리의 표식이다.
 *
 * 갈라 두어야 부딪히지 않는다. 걸음을 멈추게 한 값은 비키지 않았으므로 채움이
 * 그대로이고 테두리만 남아 "견주었으나 움직이지 않았다" 로 읽힌다. 앞선 명령형
 * 무대는 비켜선 타일을 걸음 끝에서 기본색으로 되돌리고 마지막에 줄 전체를 한 색으로
 * 칠해, 다 끝난 화면에서 **누가 비켜섰는지가 사라져 있었다.**
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 전체를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한 뒤 **장면을 통째로 다시 세운다** —
 * 보간의 끝자리와 흐르며 얹힌 임시 속성이 한꺼번에 사라진다 (S-scene).
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view) — 칸 수가 무엇이든 두 층 + 캡션 한 줄로
 * 담기므로 viewBox 를 다시 잴 일이 없다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  hasShifted,
  holeOf,
  keySeatOf,
  tallyOf,
  type InsertIntoSortedPartScene,
} from './scene.js';

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
/**
 * 벽이 솟는 시간.
 *
 * 흐를 것이 적은 걸음이라 짧게 두면 앞뒤 걸음과 구별되지 않는다 — `stepMs` 를
 * 올리면 이미 긴 걸음이 함께 길어지므로 이 걸음에만 얹는다 (S-piece 의 얇은 걸음).
 */
const WALL_MS = 260;
/** 줄이 다시 섰음을 훑는 시간. `done` 은 옮길 것이 없어 이것이 없으면 걸음이 빈다. */
const SWEEP_MS = 300;

/** 테두리 굵기 — 견줌의 표식. */
const STROKE_PLAIN = 1.6;
const STROKE_WEIGHED = 2.6;
const STROKE_WEIGHING = 3.6;

/** 훑을 때 타일이 부푸는 정도. 이미 서 있던 것이므로 나타나는 꼴이 아니라 부푸는 꼴이다. */
const SWEEP_SWELL = 0.08;
/** 훑기에서 타일 하나가 차지하는 구간. 나머지로 왼쪽부터 차례가 밀린다. */
const SWEEP_SPAN = 0.55;

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
};

/** 채움 — **값의 형편**. 이 값이 이번 삽입에서 무엇이었나. */
type Fill = 'plain' | 'shifted' | 'key';
/** 테두리 — **견줌의 표식**. */
type Edge = 'none' | 'weighed' | 'weighing';

/** 한 걸음에 옮길 것 하나. 여럿이어도 한 목록에 모아 한 시계로 흘린다. */
type Move = { tile: Tile; x0: number; y0: number; x1: number; y1: number };

/** 견줌 선의 두 끝. 허공의 값에서 짚는 칸으로 간다. */
type Link = { x1: number; y1: number; x2: number; y2: number };

/**
 * `initialData` 를 좁히는 자리는 여기다 — 장면이 비어 있어도 반드시 불리는 유일한
 * 경로이므로 (S-piece). 칸 수는 처음부터 끝까지 그대로라 슬롯을 한 번만 세운다.
 */
function readCellCount(initialData: Record<string, unknown> | undefined): number {
  const raw = initialData ?? {};
  const sorted = Array.isArray(raw.sorted) ? raw.sorted : [];
  // 줄 선 값들 + 새 값이 출발하는 칸 하나.
  return Math.max(1, sorted.length + 1);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

export const insertIntoSortedPartStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // 러너가 캔버스를 컨테이너에 먼저 붙이고 mount 를 부른다. 컨테이너를 비우면
    // 이 캔버스가 떨어져 나가므로 건드리지 않고 안쪽에만 그린다 (S-view).
    const root = el('g');
    svg.appendChild(root);

    const bandLayer = el('g');
    const slotLayer = el('g');
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

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 타일·벽·선을 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로
    // 다시 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가 이미
    // 새로 선 화면을 옛 장면으로 덮는다. 그래서 `render` 첫머리에서 세대를 올리고,
    // 운동은 `await` 뒤에 자기 세대를 확인한 뒤에만 화면에 손을 댄다 (S-scene).
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /** 한 걸음을 한 시계로 흐르게 한다. 세대가 지나면 화면에 손대지 않고 물러난다. */
    function animate(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
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
          const raw = Math.min(1, (Date.now() - started) / ms);
          draw(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 배치. 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
    const cellCount = readCellCount(params.initialData);
    const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / cellCount));
    const tileW = cellW - TILE_INSET * 2;
    const originX = Math.round((W - cellCount * cellW) / 2);

    const slotX = (i: number): number => originX + i * cellW;
    const tileX = (i: number): number => slotX(i) + TILE_INSET;

    // ── 한 번만 세우는 뼈대. 칸(자리)과 띠는 처음부터 끝까지 그대로다.
    //    재건 밖 요소라 정적 경로가 속성을 **매번 명시로** 쓴다 (S-scene).

    const band = el('rect', {
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

    const slots: SVGRectElement[] = [];
    for (let i = 0; i < cellCount; i += 1) {
      const slot = el('rect', {
        x: slotX(i) + 4,
        y: ROW_Y - 3,
        width: cellW - 8,
        height: CELL_H + 6,
        rx: 9,
      });
      slotLayer.appendChild(slot);
      slots.push(slot);
    }

    // ── 이번 장면이 세운 DOM 손잡이. 장면에서 다시 셈하는 것이라 상태가 아니다.
    let tiles: (Tile | null)[] = [];
    /** 아직 칸에 앉지 않고 허공에 들려 있는 새 값. 앉은 뒤에는 `tiles` 에 있다. */
    let heldTile: Tile | null = null;
    let wall: SVGRectElement | null = null;
    let link: SVGLineElement | null = null;

    /**
     * 견줌 선의 두 끝. **장면에서 셈한다.**
     *
     * 정적 그리기와 운동이 같은 함수를 지난다 — 그어 놓은 선의 속성을 도로 읽으면
     * 되짚어 세운 직후에는 그 값이 아직 옛 화면의 것이라 셈이 틀어진다.
     */
    function linkOf(s: InsertIntoSortedPartScene, hole: number): Link | null {
      if (s.probing === null) return null;
      return {
        x1: tileX(hole) + tileW * 0.22,
        y1: HOVER_Y + CELL_H,
        x2: tileX(s.probing) + tileW * 0.78,
        y2: ROW_Y,
      };
    }

    /** 값 하나를 담은 타일. 자리와 칠은 부르는 쪽이 정한다. */
    function makeTile(value: number): Tile {
      const g = el('g');
      const box = el('rect', {
        x: 0,
        y: 0,
        width: tileW,
        height: CELL_H,
        rx: 7,
      });
      const label = el('text', {
        x: tileW / 2,
        y: CELL_H / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
      });
      // 값 표기는 숫자 표식이다 (C10) — 키를 만들지 않는다.
      label.textContent = String(value);
      g.appendChild(box);
      g.appendChild(label);
      tileLayer.appendChild(g);
      return { g, box, label };
    }

    /**
     * 타일을 그 자리에 세운다.
     *
     * `k` 는 제 크기에 대한 배율이고 가운데를 붙든 채 부푼다. 정적 그리기와 운동이
     * **같은 함수**를 지나므로 흐르고 난 화면과 곧바로 세운 화면이 속성 하나만큼도
     * 갈리지 않는다 (S-scene 의 되짚기 판정).
     */
    function place(tile: Tile, x: number, y: number, k: number): void {
      const tx = x + (tileW * (1 - k)) / 2;
      const ty = y + (CELL_H * (1 - k)) / 2;
      tile.g.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
    }

    // ── 장면이 정하는 칠. 채움은 **값의 형편**, 테두리는 **견줌의 표식**이다.

    function fillOf(s: InsertIntoSortedPartScene, i: number): Fill {
      // 새 값은 출발 칸에 있을 때도 내려앉은 뒤에도 제 색이다 — 어느 것이 들어온
      // 값인지가 이 조각의 결론이라, 자리를 옮겨도 칠이 따라가야 한다.
      if (keySeatOf(s) === i) return 'key';
      return hasShifted(s, i) ? 'shifted' : 'plain';
    }

    function edgeOf(s: InsertIntoSortedPartScene, i: number): Edge {
      if (s.probing === i) return 'weighing';
      if (s.boundary === i || hasShifted(s, i)) return 'weighed';
      return 'none';
    }

    function paint(tile: Tile, fill: Fill, edge: Edge): void {
      switch (fill) {
        case 'key':
          tile.box.setAttribute('fill', c.accent);
          tile.label.setAttribute('fill', c.stateInk);
          break;
        case 'shifted':
          tile.box.setAttribute('fill', c.itemSorted);
          tile.label.setAttribute('fill', c.textInverse);
          break;
        case 'plain':
          tile.box.setAttribute('fill', c.itemDefault);
          tile.label.setAttribute('fill', c.text);
          break;
      }
      switch (edge) {
        case 'weighing':
          tile.box.setAttribute('stroke', c.itemComparing);
          tile.box.setAttribute('stroke-width', String(STROKE_WEIGHING));
          break;
        case 'weighed':
          tile.box.setAttribute('stroke', c.itemComparing);
          tile.box.setAttribute('stroke-width', String(STROKE_WEIGHED));
          break;
        case 'none':
          tile.box.setAttribute('stroke', c.border);
          tile.box.setAttribute('stroke-width', String(STROKE_PLAIN));
          break;
      }
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      tileLayer.textContent = '';
      wallLayer.textContent = '';
      linkLayer.textContent = '';
      tiles = [];
      heldTile = null;
      wall = null;
      link = null;
      caption.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 자리는 여기서 셈한다 (S-piece). */
    function drawStatic(s: InsertIntoSortedPartScene): void {
      const hole = holeOf(s);

      // 빈자리는 점선으로 남는다 — "자리는 저절로 벌어지지 않는다" 가 눈에 보여야 한다.
      for (let i = 0; i < slots.length; i += 1) {
        const empty = i === hole;
        const slot = slots[i];
        slot.setAttribute('fill', empty ? c.bg : c.bgSubtle);
        slot.setAttribute('stroke', empty ? c.ghostOutline : c.border);
        slot.setAttribute('stroke-width', empty ? '2' : '1.2');
        slot.setAttribute('stroke-dasharray', empty ? '7 5' : '3 4');
      }

      // 줄이 서 있는 구간의 띠. 값이 앉은 마지막 칸까지다. 다만 아직 들리지도
      // 앉지도 않은 새 값은 줄의 일원이 아니다 — 그것까지 덮으면 "왼쪽은 이미 줄이
      // 서 있다" 는 전제가 화면에서 무너진다.
      const parked = s.settledAt === null ? keySeatOf(s) : null;
      let end = -1;
      for (let i = 0; i < s.cells.length; i += 1) {
        if (s.cells[i] != null && i !== parked) end = i;
      }
      band.setAttribute('x', String(slotX(0) + 4));
      band.setAttribute('width', String(end < 0 ? 0 : slotX(end) + cellW - 4 - (slotX(0) + 4)));

      tiles = new Array<Tile | null>(slots.length).fill(null);
      for (let i = 0; i < s.cells.length && i < slots.length; i += 1) {
        const value = s.cells[i];
        if (value == null) continue;
        const tile = makeTile(value);
        place(tile, tileX(i), ROW_Y, 1);
        paint(tile, fillOf(s, i), edgeOf(s, i));
        tiles[i] = tile;
      }

      // 허공의 값은 언제나 빈자리 바로 위에 있다 — 지금 내려앉으면 어디로 갈지가
      // 매 순간 보인다. 견주는 중이면 짝의 한쪽이므로 함께 표식을 단다.
      if (hole !== null) {
        heldTile = makeTile(s.incoming);
        place(heldTile, tileX(hole), HOVER_Y, 1);
        paint(heldTile, 'key', s.probing === null ? 'none' : 'weighing');
      }

      // 걸음이 멈춘 경계. **남는 표식**이라 정적으로도 선다 (S-scene).
      if (s.boundary !== null) {
        const cx = slotX(s.boundary + 1);
        wall = el('rect', {
          x: cx - WALL_W / 2,
          y: ROW_Y - 10,
          width: WALL_W,
          height: CELL_H + 20,
          rx: WALL_W / 2,
          fill: c.accent,
          transform: `translate(${cx} ${ROW_Y + CELL_H / 2}) scale(1 1) translate(${-cx} ${-(ROW_Y + CELL_H / 2)})`,
        });
        wallLayer.appendChild(wall);
      }

      // 지금 견주는 짝을 잇는 선. 그 걸음에만 서고 다음 걸음에서 거둔다.
      const pair = hole === null ? null : linkOf(s, hole);
      if (pair !== null) {
        link = el('line', {
          ...pair,
          stroke: c.itemComparing,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
        });
        linkLayer.appendChild(link);
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(s: InsertIntoSortedPartScene): void {
      switch (s.step) {
        case null:
          caption.textContent = t(
            'caption.begin',
            'The left side is already in order. {value} goes in next.',
            { value: s.incoming },
          );
          return;
        case 'lift':
          caption.textContent = t(
            'caption.lift',
            'Lift {value} out of the row. That slot is empty now.',
            { value: s.incoming },
          );
          return;
        case 'weigh': {
          const other = s.probing === null ? null : s.cells[s.probing];
          if (other == null) {
            caption.textContent = '';
            return;
          }
          caption.textContent =
            other > s.incoming
              ? t('caption.compareYields', '{other} > {value} — {other} has to step aside.', {
                  other,
                  value: s.incoming,
                })
              : t('caption.compareHolds', '{other} is not greater than {value}.', {
                  other,
                  value: s.incoming,
                });
          return;
        }
        case 'shift': {
          // 방금 비켜선 값은 빈자리 바로 오른쪽 칸에 앉아 있다.
          const hole = holeOf(s);
          const value = hole === null ? null : s.cells[hole + 1];
          caption.textContent =
            value == null
              ? ''
              : t(
                  'caption.stepAside',
                  '{value} moves one slot to the right. The gap comes one slot closer.',
                  { value },
                );
          return;
        }
        case 'halt': {
          const other = s.boundary === null ? null : s.cells[s.boundary];
          caption.textContent =
            other == null
              ? ''
              : t(
                  'caption.stop',
                  '{other} stays put — the walk stops here, short of the left end.',
                  { other },
                );
          return;
        }
        case 'settle':
          caption.textContent = t(
            'caption.settle',
            'The gap is the slot {value} belongs in. It comes down.',
            { value: s.incoming },
          );
          return;
        case 'done': {
          // 화면에 나란히 뜨는 두 수는 장면의 구조에서 한 함수로 셈한다.
          const { compares, shifts } = tallyOf(s);
          caption.textContent = t(
            'caption.done',
            '{compares} comparisons, {shifts} step-asides — the walk never reached the left end.',
            { compares, shifts },
          );
          return;
        }
      }
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 자리로 되돌려 놓고 시작한다. 출발 자리는 **장면에서 셈한다** —
    //    `prev` 에서 꺼내면 위반이다 (S-scene).

    /** 값 여럿이 한 걸음에 자리를 옮긴다. 한 뜻의 운동이므로 **한 시계**로 돌린다. */
    function glide(moves: readonly Move[], ms: number, mine: number): Promise<void> {
      if (moves.length === 0) return Promise.resolve();
      return animate(ms, mine, (p) => {
        for (const m of moves) {
          place(m.tile, m.x0 + (m.x1 - m.x0) * p, m.y0 + (m.y1 - m.y0) * p, 1);
        }
      });
    }

    /** 견주는 순간 — 짝을 잇는 선이 허공에서 칸으로 그어진다. */
    function reach(s: InsertIntoSortedPartScene, hole: number, mine: number): Promise<void> {
      const line = link;
      const pair = linkOf(s, hole);
      if (line === null || pair === null) return Promise.resolve();
      return animate(LINK_MS, mine, (p) => {
        line.setAttribute('x2', String(pair.x1 + (pair.x2 - pair.x1) * p));
        line.setAttribute('y2', String(pair.y1 + (pair.y2 - pair.y1) * p));
      });
    }

    /** 멈추는 순간 — 벽이 바닥에서 솟는다. 걸음이 하는 말과 같은 동사다. */
    function raise(s: InsertIntoSortedPartScene, mine: number): Promise<void> {
      const node = wall;
      if (node === null || s.boundary === null) return Promise.resolve();
      const cx = slotX(s.boundary + 1);
      const cy = ROW_Y + CELL_H / 2;
      return animate(WALL_MS, mine, (p) => {
        const k = 0.15 + 0.85 * p;
        node.setAttribute(
          'transform',
          `translate(${cx} ${cy}) scale(1 ${k}) translate(${-cx} ${-cy})`,
        );
      });
    }

    /** 줄이 다시 섰다 — 왼쪽부터 차례로 부풀었다 돌아온다. 이미 서 있던 것들이다. */
    function sweep(mine: number): Promise<void> {
      const live: { tile: Tile; x: number; at: number }[] = [];
      for (let i = 0; i < tiles.length; i += 1) {
        const tile = tiles[i];
        if (tile) live.push({ tile, x: tileX(i), at: i });
      }
      if (live.length === 0) return Promise.resolve();
      const gap = live.length <= 1 ? 0 : (1 - SWEEP_SPAN) / (live.length - 1);
      return animate(SWEEP_MS, mine, (p) => {
        for (let n = 0; n < live.length; n += 1) {
          const local = Math.max(0, Math.min(1, (p - gap * n) / SWEEP_SPAN));
          place(live[n].tile, live[n].x, ROW_Y, 1 + Math.sin(local * Math.PI) * SWEEP_SWELL);
        }
      });
    }

    function flow(s: InsertIntoSortedPartScene, mine: number): Promise<void> {
      const hole = holeOf(s);
      switch (s.step) {
        case null:
          return Promise.resolve();

        // 새 값이 마지막 칸에서 뽑혀 허공으로 오른다. 뽑힌 칸이 곧 지금 빈자리다.
        case 'lift':
          if (heldTile === null || hole === null) return Promise.resolve();
          return glide(
            [{ tile: heldTile, x0: tileX(hole), y0: ROW_Y, x1: tileX(hole), y1: HOVER_Y }],
            LIFT_MS,
            mine,
          );

        case 'weigh':
          if (hole === null) return Promise.resolve();
          return reach(s, hole, mine);

        // 진 값은 오른쪽으로, 허공의 값은 왼쪽으로. 둘은 "빈자리가 옮겨 온다" 는 한
        // 사건이라 **한 목록에 모아 한 시계**로 흘린다 (S-scene).
        case 'shift': {
          if (hole === null) return Promise.resolve();
          const to = hole + 1;
          const moves: Move[] = [];
          const moved = tiles[to];
          if (moved) {
            moves.push({ tile: moved, x0: tileX(hole), y0: ROW_Y, x1: tileX(to), y1: ROW_Y });
          }
          if (heldTile) {
            moves.push({ tile: heldTile, x0: tileX(to), y0: HOVER_Y, x1: tileX(hole), y1: HOVER_Y });
          }
          return glide(moves, SLIDE_MS, mine);
        }

        case 'halt':
          return raise(s, mine);

        // 허공의 값이 빈자리로 곧장 내려앉는다. 앉은 뒤라 `tiles` 쪽에 있다.
        case 'settle': {
          const at = s.settledAt;
          if (at === null) return Promise.resolve();
          const tile = tiles[at];
          if (!tile) return Promise.resolve();
          return glide(
            [{ tile, x0: tileX(at), y0: HOVER_Y, x1: tileX(at), y1: ROW_Y }],
            SETTLE_MS,
            mine,
          );
        }

        case 'done':
          return sweep(mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌 임시
     * 속성이 한꺼번에 사라져, 흐른 화면과 곧바로 세운 화면이 갈리지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 장면의 빈자리·경계·앉은
     * 자리에서 셈한다 (S-scene).
     */
    async function render(
      next: InsertIntoSortedPartScene,
      _prev: InsertIntoSortedPartScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      rewind();
      drawStatic(next);
      drawCaption(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;
      rewind();
      drawStatic(next);
      drawCaption(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        // 걸어 둔 것을 먼저 거두고, 기다리던 것을 깨운다. 남겨 두면 emit 을 await
        // 하던 algorithm 이 영영 잠든 채로 남는다 (S-piece).
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
