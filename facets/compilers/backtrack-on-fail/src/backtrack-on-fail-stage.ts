/**
 * backtrack-on-fail 그림 — 무늬 조각이 글줄의 글자를 쥐러 내려오고, 막히면 내놓고 되감긴다.
 *
 * 위 줄은 무늬 조각들의 제자리, 가운데 줄은 글줄 글자(끝 자리는 벽 너머), 그 아래 줄은 지금 누가 어느 글자를
 * 쥐었는지, 맨 아래 줄은 글자마다 도로 내놓은 몫. 엔진 자리는 글자 사이의 세로 막대다.
 *
 * 운동 — 먹음: 띠가 한 칸 늘고 막대가 나아간다 · 맞음/막힘: 조각이 제자리에서 글자 밑으로 내려온다
 * (막히면 벽 너머에서 흔들린다) · 되돌아감: 띠가 한 칸 줄고, 내놓은 몫이 아래 줄로 떨어지며,
 * 뒤 조각들은 제자리로 날아 돌아가고, 막대가 뒤로 감긴다.
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
import { backtrackOnFailScene, type BacktrackScene, type Claim } from './scene.js';

const H = 300;
const NS = 'http://www.w3.org/2000/svg';

const LABEL_COL = 150;
const RIGHT_PAD = 24;
const CELL_MAX = 64;
const CHIP_H = 28;
const PATTERN_Y = 20;
const CURSOR_TOP = 54;
const INDEX_Y = 80;
const CELLS_TOP = 88;
const CELL_H = 44;
const HOLD_TOP = 146;
const GIVEN_TOP = 190;
const GIVEN_ROW_MAX = 24;
const CAPTION_Y = 272;
const CAPTION2_Y = 292;
const MOTION_FRAMES = 24;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? num(v) : v);
  parent.appendChild(node);
  return node;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

type Geo = {
  cellW: number;
  left: number;
  homeX: number[];
  homeW: number[];
  givenRowH: number;
};

function geometry(scene: BacktrackScene): Geo {
  const slots = scene.chars.length + 1;
  const room = PIECE_CANVAS_W - LABEL_COL - RIGHT_PAD;
  const cellW = Math.min(CELL_MAX, Math.floor(room / slots));
  const left = LABEL_COL + Math.round((room - slots * cellW) / 2);
  const chipPx = parseFloat(fontSizes.md);
  const homeW = scene.labels.map((l) => Math.max(cellW - 8, Math.ceil([...l].length * chipPx * 0.62) + 16));
  const homeX: number[] = [];
  let x = left;
  for (const w of homeW) {
    homeX.push(x);
    x += w + 10;
  }
  let deepest = 1;
  for (const g of scene.given) deepest = Math.max(deepest, g.length);
  const givenRowH = Math.min(GIVEN_ROW_MAX, (CAPTION_Y - 22 - GIVEN_TOP) / deepest);
  return { cellW, left, homeX, homeW, givenRowH };
}

/** 쥔 몫이 아래 줄에서 차지하는 자리 */
function claimBox(geo: Geo, c: Claim): { x: number; w: number } {
  if (c.kind === 'span') return { x: geo.left + c.start * geo.cellW + 2, w: c.count * geo.cellW - 4 };
  return { x: geo.left + c.at * geo.cellW + 4, w: geo.cellW - 8 };
}

function labelOf(scene: BacktrackScene, i: number): string {
  const l = scene.labels[i];
  if (l === undefined) throw new Error(`backtrack-on-fail 그림: 조각 ${i} 가 없다`);
  return l;
}

function givenAt(scene: BacktrackScene, k: number): number[] {
  const g = scene.given[k];
  if (g === undefined) throw new Error(`backtrack-on-fail 그림: 자리 ${k} 가 없다`);
  return g;
}

function charAt(scene: BacktrackScene, k: number): string {
  const ch = scene.chars[k];
  if (ch === undefined) throw new Error(`backtrack-on-fail 그림: 자리 ${k} 에 글자가 없다`);
  return ch;
}

function need<T>(v: T | null | undefined, what: string): T {
  if (v === undefined || v === null) throw new Error(`backtrack-on-fail 그림: ${what} 가 그려져 있지 않다`);
  return v;
}

/** 조각 i 가 같은 글자를 가진 조각 가운데 몇째인가 (1 부터) — 바탕(labels)에서 센다 */
function nthOf(scene: BacktrackScene, i: number): number {
  const mine = labelOf(scene, i);
  return scene.labels.slice(0, i + 1).filter((l) => l === mine).length;
}

/** 글자 자리 k 를 지금 쥔 조각 */
function ownerOf(scene: BacktrackScene, k: number): number | null {
  for (let i = 0; i < scene.claims.length; i += 1) {
    const c = scene.claims[i];
    if (c === null || c === undefined) continue;
    if (c.kind === 'span' && k >= c.start && k < c.start + c.count) return i;
    if (c.kind === 'one' && c.ok && c.at === k) return i;
  }
  return null;
}

type Handles = {
  chips: Map<number, { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement; w: number }>;
  homes: Map<number, SVGGElement>;
  cells: Map<number, SVGGElement>;
  given: Map<string, SVGGElement>;
  cursor: SVGGElement | null;
};

export const backtrackOnFailStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;
    let handles: Handles = { chips: new Map(), homes: new Map(), cells: new Map(), given: new Map(), cursor: null };

    function caption(scene: BacktrackScene): [string, string] {
      const s = scene.step;
      const heldOf = (i: number): string => {
        const cl = scene.claims[i];
        if (cl === null || cl === undefined || cl.kind !== 'span' || cl.count === 0) return t('label.none', 'nothing');
        return scene.chars.slice(cl.start, cl.start + cl.count).join('');
      };
      const lab = (i: number | null): string => {
        if (i === null) throw new Error('backtrack-on-fail 그림: 조각 없는 막힘에 조각 이름을 찾는다');
        return labelOf(scene, i);
      };
      const chAt = (k: number): string => charAt(scene, k);
      switch (s.kind) {
        case 'start':
          return [t('caption.start', 'Start at position {pos}.', { pos: scene.pos }), ''];
        case 'eat':
          return [t('caption.eat', '{piece} eats {ch}. Held: {held}', { piece: lab(s.piece), ch: chAt(s.at), held: heldOf(s.piece) }), ''];
        case 'match':
          return [t('caption.match', '{piece} #{nth} matches position {pos}.', { piece: lab(s.piece), nth: nthOf(scene, s.piece), pos: s.at }), ''];
        case 'fail':
          if (s.reason === 'end') {
            return [t('caption.failEnd', '{piece} #{nth} tried at the end cell: no character is left.', { piece: lab(s.piece), nth: nthOf(scene, need(s.piece, '막힌 조각')) }), ''];
          }
          if (s.reason === 'char') {
            return [t('caption.failChar', '{piece} #{nth} tried at position {pos}: found {ch}.', { piece: lab(s.piece), nth: nthOf(scene, need(s.piece, '막힌 조각')), pos: s.at, ch: chAt(s.at) }), ''];
          }
          return [t('caption.failRest', 'Pattern used up at position {pos}, but the line goes on.', { pos: s.at }), ''];
        case 'back': {
          const undoneMatches = s.undone.filter((u) => u.kind === 'span' || u.ok).length;
          const line1 = t('caption.back', 'Back to {piece} #{nth}: gives back {ch}. Held: {held}', {
            piece: lab(s.piece),
            nth: nthOf(scene, s.piece),
            ch: chAt(s.released),
            held: heldOf(s.piece),
          });
          const line2 =
            undoneMatches > 0
              ? t('caption.retryUndone', 'Retry from position {pos}. Matches undone: {n}', { pos: s.released, n: undoneMatches })
              : t('caption.retry', 'Retry from position {pos}.', { pos: s.released });
          return [line1, line2];
        }
        case 'done': {
          const first = scene.choice.indexOf(true);
          const line2 = first >= 0 ? t('caption.doneHeld', '{piece} holds: {held}', { piece: lab(first), held: heldOf(first) }) : '';
          return [t('caption.done', 'The whole line matched.'), line2];
        }
        case 'nomatch':
          return [t('caption.nomatch', 'No match: no choice is left to give anything back.'), ''];
      }
    }

    function drawStatic(scene: BacktrackScene): void {
      svg.textContent = '';
      const geo = geometry(scene);
      const n = scene.chars.length;
      const count = scene.labels.length;
      const fillTone = categorical(count, 'pastel');
      const lineTone = categorical(count, 'vivid');
      const tone = (arr: readonly string[], i: number): string => {
        const v = arr[i];
        if (v === undefined) throw new Error(`backtrack-on-fail 그림: 조각 ${i} 의 색이 없다`);
        return v;
      };
      const next: Handles = { chips: new Map(), homes: new Map(), cells: new Map(), given: new Map(), cursor: null };

      el('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: c.bg }, svg);

      // 줄 이름
      const rowLabel = (text: string, y: number): void => {
        const tx = el('text', {
          x: LABEL_COL - 14,
          y,
          'text-anchor': 'end',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        }, svg);
        tx.textContent = text;
      };
      rowLabel(t('label.pattern', 'Pattern'), PATTERN_Y + CHIP_H / 2);
      rowLabel(t('label.line', 'Line'), CELLS_TOP + CELL_H / 2);
      rowLabel(t('label.held', 'Held by'), HOLD_TOP + CHIP_H / 2);
      rowLabel(t('label.given', 'Given back'), GIVEN_TOP + geo.givenRowH / 2);

      // 무늬 조각의 제자리
      for (let i = 0; i < count; i += 1) {
        const hx = geo.homeX[i];
        const hw = geo.homeW[i];
        if (hx === undefined || hw === undefined) throw new Error(`backtrack-on-fail 그림: 조각 ${i} 의 자리가 없다`);
        const away = scene.claims[i] !== null;
        const g = el('g', { transform: `translate(${num(hx)},${PATTERN_Y})` }, svg);
        el('rect', {
          x: 0,
          y: 0,
          width: hw,
          height: CHIP_H,
          rx: 6,
          fill: away ? 'none' : tone(fillTone, i),
          stroke: away ? c.border : tone(lineTone, i),
          'stroke-width': away ? 1 : 1.5,
          ...(away ? { 'stroke-dasharray': '4 3' } : {}),
        }, g);
        const lt = el('text', {
          x: hw / 2,
          y: CHIP_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: away ? c.textMuted : c.stateInk,
        }, g);
        lt.textContent = labelOf(scene, i);
        next.homes.set(i, g);
      }

      // 글자 자리 번호와 글자 칸
      for (let k = 0; k < n; k += 1) {
        const x = geo.left + k * geo.cellW;
        const idx = el('text', {
          x: x + geo.cellW / 2,
          y: INDEX_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        }, svg);
        idx.textContent = String(k);
        const owner = ownerOf(scene, k);
        const g = el('g', {}, svg);
        el('rect', {
          x: x + 1,
          y: CELLS_TOP,
          width: geo.cellW - 2,
          height: CELL_H,
          rx: 4,
          fill: owner === null ? c.bgSubtle : tone(fillTone, owner),
          stroke: owner === null ? c.border : tone(lineTone, owner),
          'stroke-width': 1,
        }, g);
        const glyph = el('text', {
          x: x + geo.cellW / 2,
          y: CELLS_TOP + CELL_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          fill: owner === null ? c.text : c.stateInk,
        }, g);
        glyph.textContent = charAt(scene, k);
        next.cells.set(k, g);
      }

      // 끝 자리 — 벽과 그 너머
      const wallX = geo.left + n * geo.cellW;
      el('line', {
        x1: wallX,
        y1: CELLS_TOP - 4,
        x2: wallX,
        y2: CELLS_TOP + CELL_H + 4,
        stroke: c.textMuted,
        'stroke-width': 2,
      }, svg);
      if (scene.result === null) {
        const endT = el('text', {
          x: wallX + geo.cellW / 2,
          y: CELLS_TOP + CELL_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        }, svg);
        endT.textContent = t('label.end', 'end');
      } else if (scene.result === 'match') {
        const cx = wallX + geo.cellW / 2;
        const cy = CELLS_TOP + CELL_H / 2;
        el('circle', { cx, cy, r: 15, fill: c.accent, stroke: c.stateInk, 'stroke-width': 1.5 }, svg);
        el('path', {
          d: `M${num(cx - 7)},${num(cy)} L${num(cx - 2)},${num(cy + 5)} L${num(cx + 7)},${num(cy - 5)}`,
          fill: 'none',
          stroke: c.stateInk,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }, svg);
      } else {
        const cx = wallX + geo.cellW / 2;
        const cy = CELLS_TOP + CELL_H / 2;
        for (const d of [1, -1]) {
          el('line', { x1: cx - 8, y1: cy - 8 * d, x2: cx + 8, y2: cy + 8 * d, stroke: c.danger, 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
        }
      }

      // 지금 쥔 몫
      for (let i = 0; i < count; i += 1) {
        const cl = scene.claims[i];
        if (cl === null || cl === undefined) continue;
        if (cl.kind === 'span' && cl.count === 0) continue;
        const box = claimBox(geo, cl);
        const failed = cl.kind === 'one' && !cl.ok;
        const g = el('g', { transform: `translate(${num(box.x)},${HOLD_TOP})` }, svg);
        const rect = el('rect', {
          x: 0,
          y: 0,
          width: box.w,
          height: CHIP_H,
          rx: 6,
          fill: failed ? c.bg : tone(fillTone, i),
          stroke: failed ? c.danger : tone(lineTone, i),
          'stroke-width': failed ? 2 : 1.5,
          ...(failed ? { 'stroke-dasharray': '5 3' } : {}),
        }, g);
        const label = el('text', {
          x: box.w / 2,
          y: CHIP_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: failed ? c.danger : c.stateInk,
        }, g);
        label.textContent = labelOf(scene, i);
        if (failed) {
          const mx = box.w - 2;
          for (const d of [1, -1]) {
            el('line', { x1: mx - 5, y1: -2 - 5 * d, x2: mx + 5, y2: -2 + 5 * d, stroke: c.danger, 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
          }
        }
        next.chips.set(i, { g, rect, label, w: box.w });
      }

      // 도로 내놓은 몫 — 글자마다 차례대로 쌓인다
      for (let k = 0; k < n; k += 1) {
        const list = givenAt(scene, k);
        list.forEach((piece, m) => {
          const x = geo.left + k * geo.cellW + 4;
          const w = geo.cellW - 8;
          const y = GIVEN_TOP + m * geo.givenRowH;
          const h = geo.givenRowH - 4;
          const g = el('g', { transform: `translate(${num(x)},${num(y)})` }, svg);
          el('rect', {
            x: 0,
            y: 0,
            width: w,
            height: h,
            rx: 3,
            fill: 'none',
            stroke: tone(lineTone, piece),
            'stroke-width': 1,
            'stroke-dasharray': '3 2',
          }, g);
          const lt = el('text', {
            x: w / 2,
            y: h / 2,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          }, g);
          const lbl = labelOf(scene, piece);
          lt.textContent = lbl;
          const strikeW = Math.min(w - 6, [...lbl].length * parseFloat(fontSizes.sm) * 0.62 + 6);
          el('line', {
            x1: w / 2 - strikeW / 2,
            y1: h / 2,
            x2: w / 2 + strikeW / 2,
            y2: h / 2,
            stroke: c.textMuted,
            'stroke-width': 1,
          }, g);
          next.given.set(`${k}:${m}`, g);
        });
      }

      // 엔진 자리 — 글자 사이의 막대
      const cursor = el('g', { transform: `translate(${num(geo.left + scene.pos * geo.cellW)},0)` }, svg);
      el('path', { d: `M-6,${CURSOR_TOP} L6,${CURSOR_TOP} L0,${CURSOR_TOP + 9} Z`, fill: c.itemActive }, cursor);
      el('line', {
        x1: 0,
        y1: CURSOR_TOP + 9,
        x2: 0,
        y2: CELLS_TOP + CELL_H + 6,
        stroke: c.itemActive,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
      }, cursor);
      next.cursor = cursor;

      // 캡션 — 지금 일어나는 일
      const [l1, l2] = caption(scene);
      const cap = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      }, svg);
      cap.textContent = l1;
      if (l2 !== '') {
        const cap2 = el('text', {
          x: PIECE_CANVAS_W / 2,
          y: CAPTION2_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        }, svg);
        cap2.textContent = l2;
      }
      handles = next;
    }

    /** 한 시계 — 프레임마다 k(0→1) 를 넘긴다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function clock(mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let finished = false;
        let i = 0;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          i += 1;
          const k = Math.min(1, i / MOTION_FRAMES);
          frame(k);
          if (k >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function motion(scene: BacktrackScene, mine: number): Promise<void> {
      const geo = geometry(scene);
      const s = scene.step;
      const h = handles;
      const cursor = need(h.cursor, '엔진 자리 막대');
      const cursorX = (p: number): number => geo.left + p * geo.cellW;
      const moveCursor = (from: number, to: number, k: number): void => {
        cursor.setAttribute('transform', `translate(${num(cursorX(from) + (cursorX(to) - cursorX(from)) * k)},0)`);
      };
      // 조각이 (x0, y0) 에서 제자리로 오는 중 — 아직 못 온 만큼 비켜 둔다
      const place = (g: SVGGElement, x0: number, y0: number, x1: number, y1: number, k: number): void => {
        g.setAttribute('transform', `translate(${num(x0 + (x1 - x0) * k)},${num(y0 + (y1 - y0) * k)})`);
      };
      const homeOf = (i: number): { x: number; w: number } => {
        const x = geo.homeX[i];
        const w = geo.homeW[i];
        if (x === undefined || w === undefined) throw new Error(`backtrack-on-fail 그림: 조각 ${i} 의 제자리가 없다`);
        return { x, w };
      };
      const resize = (chip: { rect: SVGRectElement; label: SVGTextElement }, w: number): void => {
        chip.rect.setAttribute('width', num(w));
        chip.label.setAttribute('x', num(w / 2));
      };

      if (s.kind === 'eat') {
        const chip = need(h.chips.get(s.piece), `조각 ${s.piece} 의 띠`);
        const cl = need(scene.claims[s.piece], `조각 ${s.piece} 의 몫`);
        const box = claimBox(geo, cl);
        const home = homeOf(s.piece);
        const fromW = s.was === 0 ? home.w : s.was * geo.cellW - 4;
        const fromX = s.was === 0 ? home.x : box.x;
        const fromY = s.was === 0 ? PATTERN_Y : HOLD_TOP;
        await clock(mine, (q) => {
          const k = ease(q);
          place(chip.g, fromX, fromY, box.x, HOLD_TOP, k);
          resize(chip, fromW + (box.w - fromW) * k);
          moveCursor(s.at, s.at + 1, k);
        });
        return;
      }

      if (s.kind === 'match' || (s.kind === 'fail' && s.piece !== null)) {
        const piece = need(s.piece, '막힌 조각');
        const chip = need(h.chips.get(piece), `조각 ${piece}`);
        const cl = need(scene.claims[piece], `조각 ${piece} 의 몫`);
        const box = claimBox(geo, cl);
        const home = homeOf(piece);
        const failing = s.kind === 'fail';
        const landAt = failing ? 0.7 : 1;
        await clock(mine, (q) => {
          const k = ease(Math.min(1, q / landAt));
          const shake = failing && q > landAt ? Math.round(Math.sin(((q - landAt) / (1 - landAt)) * Math.PI * 3) * 5 * 100) / 100 : 0;
          place(chip.g, home.x + (home.w - box.w) / 2, PATTERN_Y, box.x + shake, HOLD_TOP, k);
          moveCursor(s.cursorWas, scene.pos, k);
        });
        return;
      }

      if (s.kind === 'back') {
        const cl = need(scene.claims[s.piece], `조각 ${s.piece} 의 몫`);
        if (cl.kind !== 'span') throw new Error(`backtrack-on-fail 그림: 되돌아간 조각 ${s.piece} 가 쥔 띠가 아니다`);
        // 다 내놓아 0 글자가 되면 띠는 그려지지 않는다 — 줄어들 띠가 없다
        const band = cl.count > 0 ? need(h.chips.get(s.piece), `조각 ${s.piece} 의 띠`) : null;
        const bandFrom = (cl.count + 1) * geo.cellW - 4;
        const bandTo = cl.count * geo.cellW - 4;
        // 내놓은 몫이 아래 줄로 떨어진다
        const dropMarks: { g: SVGGElement; x: number; y: number }[] = [];
        const drop = (k: number, piece: number): void => {
          const m = givenAt(scene, k).lastIndexOf(piece);
          const mark = need(h.given.get(`${k}:${m}`), `자리 ${k} 의 내놓은 몫`);
          dropMarks.push({ g: mark, x: geo.left + k * geo.cellW + 4, y: GIVEN_TOP + m * geo.givenRowH });
        };
        drop(s.released, s.piece);
        // 뒤 조각들은 쥔 자리에서 제자리로 날아 돌아간다
        const flyHome: { g: SVGGElement; x0: number; x1: number }[] = [];
        for (const u of s.undone) {
          const homeG = need(h.homes.get(u.piece), `조각 ${u.piece} 의 제자리`);
          const home = homeOf(u.piece);
          const box = claimBox(geo, u.kind === 'one' ? { kind: 'one', at: u.at, ok: u.ok } : { kind: 'span', start: u.start, count: u.count });
          flyHome.push({ g: homeG, x0: box.x + (box.w - home.w) / 2, x1: home.x });
          // 막혔던 조각은 쥔 글자가 없어 내놓은 몫도 없다
          if (u.kind === 'one' && u.ok) drop(u.at, u.piece);
          if (u.kind === 'span') for (let k = u.start; k < u.start + u.count; k += 1) drop(k, u.piece);
        }
        const releasedCell = need(h.cells.get(s.released), `자리 ${s.released} 의 글자 칸`);
        await clock(mine, (q) => {
          const k = ease(q);
          if (band !== null) resize(band, bandFrom + (bandTo - bandFrom) * k);
          for (const d of dropMarks) place(d.g, d.x, HOLD_TOP, d.x, d.y, k);
          for (const f of flyHome) place(f.g, f.x0, HOLD_TOP, f.x1, PATTERN_Y, k);
          const hop = Math.round(-Math.sin(q * Math.PI) * 10 * 100) / 100;
          releasedCell.setAttribute('transform', `translate(0,${num(hop)})`);
          moveCursor(s.cursorWas, scene.pos, k);
        });
      }
    }

    async function render(next: BacktrackScene, prev: BacktrackScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      if (!opts.animate || prev === null) return;
      const s = next.step;
      const moves = s.kind === 'eat' || s.kind === 'match' || s.kind === 'back' || (s.kind === 'fail' && s.piece !== null);
      if (!moves) return;
      await motion(next, mine);
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    // 마운트 직후 — initialData 가 있으면 걸음 0 을 세운다. 없어도 던지지 않는다
    if (params.initialData !== undefined) {
      drawStatic(backtrackOnFailScene.initial(params.initialData));
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
