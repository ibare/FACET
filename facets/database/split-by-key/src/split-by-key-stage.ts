/**
 * split-by-key 무대 — 흩어진다, 그리고 곧장 간다.
 *
 * 위에 한 표의 줄이 한 줄로 모여 있고, 가운데에 셈 문(열쇠 mod 샤드 수)이 있고,
 * 아래에 샤드 상자가 늘어선다. 옮김 걸음마다 줄 하나가 문 안으로 들어가 셈을 거친 뒤
 * 제 샤드의 맨 아래 자리로 흘러가 쌓인다. 조회 걸음에는 조회 표가 같은 문을 지나
 * 샤드 하나로 가는 길 위에 멈추고, 나머지 샤드는 흐려진다. 찾음 걸음에는 그 샤드 안만
 * 도착 차례로 훑어 찾은 줄에 멈춘다.
 *
 * 정적 그리기가 정본이다. 운동은 정적 그림의 요소를 아직 못 온 자리로 되돌려 놓고 끝 자리로 흘린다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { SplitByKeyScene } from './scene';

const H = 360;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 바깥 여백 */
const MARGIN = 16;
/** 줄 표 사이 가로 틈 */
const SRC_GAP = 6;
/** 줄 표 폭의 상한 — 실제 폭은 캔버스 폭에서 역산한다 */
const TILE_W_MAX = 84;
/** 줄 표 높이 + 세로 틈의 상한 */
const PITCH_MAX = 32;
const TILE_V_GAP = 4;
/** 샤드 상자 사이 틈 */
const SHARD_GAP = 12;
const SHARD_HEAD = 26;
const SHARD_PAD = 8;

/** 운동 시간 */
const INTO_GATE_MS = 250;
const GATE_HOLD_MS = 100;
const OUT_OF_GATE_MS = 300;
const SCAN_MS = 200;
const FRAME_MS = 16;
/** 조회하지 않는 샤드의 흐림 */
const DIM = 0.35;

const SM_PX = parseFloat(fontSizes.sm);
/** 고정폭 글자 하나의 폭 비율 */
const MONO_RATIO = 0.62;

type Box = { x: number; y: number; w: number; h: number };

type Layout = {
  tileW: number;
  tileH: number;
  pitch: number;
  srcY: number;
  gate: Box;
  shardTop: number;
  shardW: number;
  captionY: number;
};

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return out === 0 ? 0 : out;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpBox(a: Box, b: Box, u: number): Box {
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), w: lerp(a.w, b.w, u), h: lerp(a.h, b.h, u) };
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function layoutOf(scene: SplitByKeyScene): Layout {
  const n = Math.max(1, scene.rows.length);
  const k = Math.max(1, scene.shardCount);
  const inner = W - 2 * MARGIN;
  const tileW = Math.min(TILE_W_MAX, (inner - (n - 1) * SRC_GAP) / n);
  const srcY = 36;
  const gate: Box = { x: W / 2 - 110, y: 100, w: 220, h: 44 };
  const shardTop = 190;
  const captionY = H - 14;
  const rowsTop = shardTop + SHARD_HEAD;
  // 지금 가장 많이 쌓인 샤드가 담기게 간격을 정한다 — 넘치면 간격을 줄여 담는다
  const counts = Array.from({ length: k }, (_, s) => scene.placed.filter((p) => p.shard === s).length);
  const most = Math.max(1, ...counts);
  const pitch = Math.min(PITCH_MAX, (captionY - 22 - rowsTop - SHARD_PAD) / most);
  const tileH = pitch - TILE_V_GAP;
  const shardW = (inner - (k - 1) * SHARD_GAP) / k;
  return { tileW, tileH, pitch, srcY, gate, shardTop, shardW, captionY };
}

function srcBox(L: Layout, n: number, i: number): Box {
  const total = n * L.tileW + (n - 1) * SRC_GAP;
  const x0 = (W - total) / 2;
  return { x: x0 + i * (L.tileW + SRC_GAP), y: L.srcY, w: L.tileW, h: L.tileH };
}

function shardX(L: Layout, s: number): number {
  return MARGIN + s * (L.shardW + SHARD_GAP);
}

function slotBox(L: Layout, s: number, j: number): Box {
  return {
    x: shardX(L, s) + SHARD_PAD,
    y: L.shardTop + SHARD_HEAD + j * L.pitch,
    w: L.shardW - 2 * SHARD_PAD,
    h: L.tileH,
  };
}

function shardHeight(L: Layout, count: number): number {
  return SHARD_HEAD + count * L.pitch + SHARD_PAD - TILE_V_GAP;
}

function gateCenterBox(L: Layout): Box {
  return {
    x: L.gate.x + L.gate.w / 2 - L.tileW / 2,
    y: L.gate.y + L.gate.h / 2 - L.tileH / 2,
    w: L.tileW,
    h: L.tileH,
  };
}

/** 조회 표가 머무는 자리 — 문에서 샤드로 가는 길의 한가운데 */
function queryRest(L: Layout, s: number, w: number): Box {
  const ax = W / 2;
  const ay = L.gate.y + L.gate.h;
  const bx = shardX(L, s) + L.shardW / 2;
  const by = L.shardTop;
  return { x: (ax + bx) / 2 - w / 2, y: (ay + by) / 2 - L.tileH / 2, w, h: L.tileH };
}

function monoWidth(text: string): number {
  return text.length * SM_PX * MONO_RATIO + 2 * SHARD_PAD;
}

/** 줄 하나의 표 — 같은 줄이 어디에 있든 같은 모양이다 */
type TileEls = { g: SVGGElement; rect: SVGRectElement; stripe: SVGRectElement; id: SVGTextElement; val: SVGTextElement };

type TokenEls = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement };

type Handles = {
  tiles: Map<number, TileEls>;
  shardGroups: SVGGElement[];
  shardBoxes: SVGRectElement[];
  shardCounts: SVGTextElement[];
  exits: SVGLineElement[];
  gateCalc: SVGTextElement | null;
  token: TokenEls | null;
  marker: SVGRectElement | null;
};

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [a, v] of Object.entries(attrs)) {
    node.setAttribute(a, typeof v === 'number' ? String(r1(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function placeTile(tile: TileEls, b: Box): void {
  tile.rect.setAttribute('x', String(r1(b.x)));
  tile.rect.setAttribute('y', String(r1(b.y)));
  tile.rect.setAttribute('width', String(r1(b.w)));
  tile.rect.setAttribute('height', String(r1(b.h)));
  tile.stripe.setAttribute('x', String(r1(b.x)));
  tile.stripe.setAttribute('y', String(r1(b.y)));
  tile.stripe.setAttribute('height', String(r1(b.h)));
  tile.id.setAttribute('x', String(r1(b.x + 8)));
  tile.id.setAttribute('y', String(r1(b.y + b.h / 2)));
  tile.val.setAttribute('x', String(r1(b.x + b.w - 6)));
  tile.val.setAttribute('y', String(r1(b.y + b.h / 2)));
}

function placeToken(token: TokenEls, b: Box): void {
  token.rect.setAttribute('x', String(r1(b.x)));
  token.rect.setAttribute('y', String(r1(b.y)));
  token.rect.setAttribute('width', String(r1(b.w)));
  token.rect.setAttribute('height', String(r1(b.h)));
  token.text.setAttribute('x', String(r1(b.x + b.w / 2)));
  token.text.setAttribute('y', String(r1(b.y + b.h / 2)));
}

function styleExit(line: SVGLineElement, color: string, pal: Palette, on: boolean, dim: boolean): void {
  if (on) {
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '2.5');
    line.removeAttribute('stroke-dasharray');
  } else {
    line.setAttribute('stroke', pal.border);
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '4 4');
  }
  if (dim) line.setAttribute('opacity', String(DIM));
  else line.removeAttribute('opacity');
}

export const splitByKeyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const pal = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function alive(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const done = (): void => {
          clearTimeout(id);
          timers.delete(id);
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    /** 정해진 프레임 수만큼 흘린다. 세대가 바뀌면 멈추고 false */
    async function tween(ms: number, frame: (u: number) => void, mine: number): Promise<boolean> {
      const frames = Math.max(1, Math.round(ms / FRAME_MS));
      for (let f = 1; f <= frames; f += 1) {
        if (!alive(mine)) return false;
        await wait(FRAME_MS);
        if (!alive(mine)) return false;
        frame(ease(f / frames));
      }
      return true;
    }

    function drawStatic(scene: SplitByKeyScene): Handles {
      svg.textContent = '';
      const L = layoutOf(scene);
      const k = scene.shardCount;
      const n = scene.rows.length;
      const colors = categorical(k, 'vivid');
      const handles: Handles = {
        tiles: new Map(),
        shardGroups: [],
        shardBoxes: [],
        shardCounts: [],
        exits: [],
        gateCalc: null,
        token: null,
        marker: null,
      };
      const step = scene.step;
      const query = scene.query;

      // 표 이름과 열
      const head = el(svg, 'text', {
        x: MARGIN,
        y: 20,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: pal.textMuted,
      });
      head.textContent = t('label.table', '{table} ({key} | {value})', {
        table: scene.table,
        key: scene.keyColumn,
        value: scene.valueColumn,
      });

      // 샤드별 도착 차례
      const inShard: number[][] = Array.from({ length: k }, () => []);
      for (const p of scene.placed) {
        const list = inShard[p.shard];
        if (list === undefined) throw new Error(`split-by-key 무대: 샤드 ${p.shard} 가 없다`);
        list.push(p.row);
      }
      const placedRows = new Set(scene.placed.map((p) => p.row));

      // 떠난 줄의 빈자리
      for (let i = 0; i < n; i += 1) {
        if (!placedRows.has(i)) continue;
        const b = srcBox(L, n, i);
        el(svg, 'rect', {
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
          rx: 4,
          fill: 'none',
          stroke: pal.border,
          'stroke-dasharray': '3 3',
        });
      }

      // 문에서 샤드로 가는 길
      const litShard =
        step.kind === 'place' ? step.shard : query !== null ? query.shard : -1;
      for (let s = 0; s < k; s += 1) {
        const line = el(svg, 'line', {
          x1: W / 2,
          y1: L.gate.y + L.gate.h,
          x2: shardX(L, s) + L.shardW / 2,
          y2: L.shardTop,
          'stroke-linecap': 'round',
        });
        styleExit(line, colors[s] ?? pal.primary, pal, s === litShard, query !== null && s !== query.shard);
        handles.exits.push(line);
      }

      // 샤드 상자와 쌓인 줄
      const tileLayer = el(svg, 'g', {});
      for (let s = 0; s < k; s += 1) {
        const color = colors[s] ?? pal.primary;
        const list = inShard[s] ?? [];
        const g = el(tileLayer, 'g', {});
        if (query !== null && s !== query.shard) g.setAttribute('opacity', String(DIM));
        handles.shardGroups.push(g);
        const x = shardX(L, s);
        const box = el(g, 'rect', {
          x,
          y: L.shardTop,
          width: L.shardW,
          height: shardHeight(L, list.length),
          rx: 6,
          fill: pal.bgSubtle,
          stroke: color,
          'stroke-width': 1.5,
        });
        handles.shardBoxes.push(box);
        const name = el(g, 'text', {
          x: x + SHARD_PAD,
          y: L.shardTop + SHARD_HEAD / 2 + 1,
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: color,
        });
        name.textContent = t('label.shard', 'Shard {n}', { n: s });
        const count = el(g, 'text', {
          x: x + L.shardW - SHARD_PAD,
          y: L.shardTop + SHARD_HEAD / 2 + 1,
          'dominant-baseline': 'central',
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: pal.textMuted,
        });
        count.textContent = t('label.rows', 'Rows: {n}', { n: list.length });
        handles.shardCounts.push(count);
        list.forEach((row, j) => {
          const tile = drawTile(g, scene, row, color);
          placeTile(tile, slotBox(L, s, j));
          if (step.kind === 'place' && step.row === row) {
            tile.rect.setAttribute('stroke', pal.itemActive);
            tile.rect.setAttribute('stroke-width', '2');
          }
          handles.tiles.set(row, tile);
        });
      }

      // 아직 한곳에 있는 줄
      for (let i = 0; i < n; i += 1) {
        if (placedRows.has(i)) continue;
        const tile = drawTile(tileLayer, scene, i, null);
        placeTile(tile, srcBox(L, n, i));
        handles.tiles.set(i, tile);
      }

      // 찾은 줄
      if (scene.found !== null) {
        const found = scene.found;
        const j = (inShard[found.shard] ?? []).indexOf(found.row);
        if (j < 0) throw new Error(`split-by-key 무대: 샤드 ${found.shard} 에 줄 ${found.row} 이 없다`);
        const b = slotBox(L, found.shard, j);
        handles.marker = el(svg, 'rect', {
          x: b.x - 3,
          y: b.y - 3,
          width: b.w + 6,
          height: b.h + 6,
          rx: 6,
          fill: pal.accent,
          'fill-opacity': 0.3,
          stroke: pal.accent,
          'stroke-width': 2.5,
        });
      }

      // 조회 표 — 문보다 먼저 그려 문을 지날 때 안으로 들어간다
      if (query !== null) {
        const label = t('label.query', 'Lookup {col} = {key}', { col: scene.keyColumn, key: query.key });
        const g = el(svg, 'g', {});
        const rect = el(g, 'rect', {
          rx: 4,
          fill: pal.bg,
          stroke: pal.accent,
          'stroke-width': 2,
        });
        const text = el(g, 'text', {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: pal.text,
        });
        text.textContent = label;
        const token: TokenEls = { g, rect, text };
        placeToken(token, queryRest(L, query.shard, monoWidth(label)));
        handles.token = token;
      }

      // 셈 문 — 줄 표 위에 그려 표가 문을 지날 때 안으로 들어간다
      const gate = L.gate;
      el(svg, 'rect', {
        x: gate.x,
        y: gate.y,
        width: gate.w,
        height: gate.h,
        rx: 8,
        fill: pal.bg,
        stroke: pal.text,
        'stroke-width': 1.5,
      });
      const rule = el(svg, 'text', {
        x: W / 2,
        y: gate.y + 13,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: pal.textMuted,
      });
      rule.textContent = t('label.rule', '{col} mod {k}', { col: scene.keyColumn, k });
      const calc = el(svg, 'text', {
        x: W / 2,
        y: gate.y + 31,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: pal.text,
      });
      if (step.kind === 'place') {
        const row = scene.rows[step.row];
        if (row === undefined) throw new Error(`split-by-key 무대: 줄 ${step.row} 이 없다`);
        calc.textContent = t('label.calc', '{id} mod {k} = {shard}', { id: row.id, k, shard: step.shard });
      } else if (query !== null) {
        calc.textContent = t('label.calc', '{id} mod {k} = {shard}', { id: query.key, k, shard: query.shard });
      }
      handles.gateCalc = calc;

      // 캡션 — 지금 일어나는 일
      const cap = el(svg, 'text', {
        x: W / 2,
        y: L.captionY,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: pal.text,
      });
      cap.textContent = captionOf(scene);
      return handles;
    }

    function drawTile(parent: Element, scene: SplitByKeyScene, row: number, color: string | null): TileEls {
      const data = scene.rows[row];
      if (data === undefined) throw new Error(`split-by-key 무대: 줄 ${row} 이 없다`);
      const g = el(parent, 'g', {});
      const rect = el(g, 'rect', { rx: 4, fill: pal.bg, stroke: color ?? pal.border, 'stroke-width': 1.2 });
      const stripe = el(g, 'rect', { width: 4, fill: color ?? pal.textMuted });
      const id = el(g, 'text', {
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: pal.text,
      });
      id.textContent = String(data.id);
      const val = el(g, 'text', {
        'dominant-baseline': 'central',
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: pal.textMuted,
      });
      val.textContent = String(data.value);
      return { g, rect, stripe, id, val };
    }

    function captionOf(scene: SplitByKeyScene): string {
      const step = scene.step;
      if (step.kind === 'start') {
        return t('caption.start', 'Rows still together in {table}: {n}.', {
          table: scene.table,
          n: scene.rows.length - scene.placed.length,
        });
      }
      if (step.kind === 'place') {
        const row = scene.rows[step.row];
        if (row === undefined) throw new Error(`split-by-key 무대: 줄 ${step.row} 이 없다`);
        return t('caption.place', 'Row with {col} {id} goes to shard {shard}.', {
          col: scene.keyColumn,
          id: row.id,
          shard: step.shard,
        });
      }
      if (step.kind === 'route') {
        if (scene.query === null) throw new Error('split-by-key 무대: 조회 걸음에 조회가 없다');
        return t('caption.route', 'Lookup {col} = {key} goes straight to shard {shard}.', {
          col: scene.keyColumn,
          key: scene.query.key,
          shard: scene.query.shard,
        });
      }
      const found = scene.found;
      if (found === null) throw new Error('split-by-key 무대: 찾음 걸음에 찾은 줄이 없다');
      const row = scene.rows[found.row];
      if (row === undefined) throw new Error(`split-by-key 무대: 줄 ${found.row} 이 없다`);
      return t(
        'caption.found',
        'Row found in shard {shard}: ({id}, {value}). Shards looked into: {looked} / {total}.',
        { shard: found.shard, id: row.id, value: row.value, looked: found.looked, total: scene.shardCount },
      );
    }

    async function animatePlace(scene: SplitByKeyScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'place') return;
      const L = layoutOf(scene);
      const tile = h.tiles.get(step.row);
      const box = h.shardBoxes[step.shard];
      const count = h.shardCounts[step.shard];
      const exit = h.exits[step.shard];
      if (tile === undefined || box === undefined || count === undefined || exit === undefined) {
        throw new Error(`split-by-key 무대: 줄 ${step.row} 의 손잡이가 없다`);
      }
      const colors = categorical(scene.shardCount, 'vivid');
      const already = scene.placed.filter((p) => p.shard === step.shard).length - 1;
      const from = srcBox(L, scene.rows.length, step.row);
      const mid = gateCenterBox(L);
      const to = slotBox(L, step.shard, already);
      const h0 = shardHeight(L, already);
      const h1 = shardHeight(L, already + 1);
      const calcText = h.gateCalc?.textContent ?? '';

      // 아직 못 온 자리로 되돌린다
      placeTile(tile, from);
      if (h.gateCalc !== null) h.gateCalc.textContent = '';
      styleExit(exit, colors[step.shard] ?? pal.primary, pal, false, false);
      box.setAttribute('height', String(r1(h0)));
      count.textContent = t('label.rows', 'Rows: {n}', { n: already });

      if (!(await tween(INTO_GATE_MS, (u) => placeTile(tile, lerpBox(from, mid, u)), mine))) return;
      if (h.gateCalc !== null) h.gateCalc.textContent = calcText;
      styleExit(exit, colors[step.shard] ?? pal.primary, pal, true, false);
      await wait(GATE_HOLD_MS);
      if (!alive(mine)) return;
      if (
        !(await tween(
          OUT_OF_GATE_MS,
          (u) => {
            placeTile(tile, lerpBox(mid, to, u));
            box.setAttribute('height', String(r1(lerp(h0, h1, u))));
          },
          mine,
        ))
      ) {
        return;
      }
      count.textContent = t('label.rows', 'Rows: {n}', { n: already + 1 });
    }

    async function animateRoute(scene: SplitByKeyScene, h: Handles, mine: number): Promise<void> {
      const query = scene.query;
      const token = h.token;
      if (query === null || token === null) return;
      const L = layoutOf(scene);
      const colors = categorical(scene.shardCount, 'vivid');
      const w = Number(token.rect.getAttribute('width'));
      const rest = queryRest(L, query.shard, w);
      const start: Box = { x: W / 2 - w / 2, y: L.srcY, w, h: L.tileH };
      const mid: Box = { x: W / 2 - w / 2, y: L.gate.y + L.gate.h / 2 - L.tileH / 2, w, h: L.tileH };
      const calcText = h.gateCalc?.textContent ?? '';
      const others = h.shardGroups.filter((_, s) => s !== query.shard);

      placeToken(token, start);
      if (h.gateCalc !== null) h.gateCalc.textContent = '';
      h.exits.forEach((line, s) => styleExit(line, colors[s] ?? pal.primary, pal, false, false));
      for (const g of others) g.removeAttribute('opacity');

      // 문 안으로 들어가 셈을 거친 뒤 샤드 하나로 가는 길 위에 멈춘다
      if (!(await tween(INTO_GATE_MS, (u) => placeToken(token, lerpBox(start, mid, u)), mine))) return;
      if (h.gateCalc !== null) h.gateCalc.textContent = calcText;
      h.exits.forEach((line, s) =>
        styleExit(line, colors[s] ?? pal.primary, pal, s === query.shard, s !== query.shard),
      );
      await wait(GATE_HOLD_MS);
      if (!alive(mine)) return;
      await tween(
        OUT_OF_GATE_MS,
        (u) => {
          placeToken(token, lerpBox(mid, rest, u));
          for (const g of others) g.setAttribute('opacity', String(Math.round(lerp(1, DIM, u) * 100) / 100));
        },
        mine,
      );
    }

    async function animateFound(scene: SplitByKeyScene, h: Handles, mine: number): Promise<void> {
      const found = scene.found;
      const marker = h.marker;
      if (found === null || marker === null) return;
      const L = layoutOf(scene);
      const order = scene.placed.filter((p) => p.shard === found.shard).map((p) => p.row);
      const j = order.indexOf(found.row);
      if (j < 0) return;
      const at = (b: Box): void => {
        marker.setAttribute('x', String(r1(b.x - 3)));
        marker.setAttribute('y', String(r1(b.y - 3)));
      };
      // 샤드 안만 도착 차례로 훑는다 — 찾기 전에는 채우지 않는다
      marker.setAttribute('fill-opacity', '0');
      at(slotBox(L, found.shard, 0));
      for (let i = 1; i <= j; i += 1) {
        if (!alive(mine)) return;
        const a = slotBox(L, found.shard, i - 1);
        const b = slotBox(L, found.shard, i);
        if (!(await tween(SCAN_MS, (u) => at(lerpBox(a, b, u)), mine))) return;
      }
      await wait(SCAN_MS);
    }

    function render(next: SplitByKeyScene, prev: SplitByKeyScene | null, opts: { animate: boolean }): void | Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate || prev === null) return;
      const kind = next.step.kind;
      let run: Promise<void> | null = null;
      if (kind === 'place' && next.placed.length === prev.placed.length + 1) run = animatePlace(next, h, mine);
      else if (kind === 'route' && prev.query === null) run = animateRoute(next, h, mine);
      else if (kind === 'found' && prev.found === null) run = animateFound(next, h, mine);
      if (run === null) return;
      return run.then(() => {
        if (alive(mine)) drawStatic(next);
      });
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
