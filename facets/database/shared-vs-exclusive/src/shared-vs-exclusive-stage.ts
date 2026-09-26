/**
 * shared-vs-exclusive 무대.
 *
 * 동사: 겹쳐 쌓이고 튕겨 난다.
 * 줄마다 바닥판 하나가 있고, 요청은 위에서 떨어진다. 허락된 요청은 판 위에 한 장씩 쌓인다 —
 * 공유(S)는 판보다 좁은 얇은 장이라 여럿이 포개지고, 배타(X)는 판 너비를 다 덮는 짙은 덩어리다.
 * 막힌 요청은 쌓인 것의 꼭대기에 부딪혀 옆으로 튕겨 나가 기울어진 채 남는다.
 * 두 줄을 한 화면에 나란히 둔다 — 견줌이 곧 주장이다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Hold, Mode, RowScene, SharedVsExclusiveScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 300;

const CAPTION_Y = 28;
const DROP_Y = 62;
const GROUND_TOP = 214;
const SLAB_H = 30;
const COUNT_Y = GROUND_TOP + SLAB_H + 24;
const PLATE_H_MAX = 30;
const PLATE_GAP = 4;
const STACK_W_MAX = 190;
const TURN_W_MAX = 96;
const TURN_TILT = -12;
const BOUNCE_RISE = 34;

const GRANT_MS = 480;
const BLOCK_MS = 760;

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r === 0 ? 0 : r);
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? fmt(v) : v);
  parent.appendChild(node);
  return node;
}

/** 교과서 표기 `S1(x)` — 트랜잭션 이름은 `T<번호>` 여야 한다 */
function notation(mode: Mode, txn: string, row: string): string {
  const m = /^T(\d+)$/.exec(txn);
  if (m === null) throw new Error(`shared-vs-exclusive stage: 트랜잭션 이름 '${txn}' 에 번호가 없다`);
  return mode + m[1] + '(' + row + ')';
}

type ColumnGeo = {
  x0: number;
  colW: number;
  stackCx: number;
  stackW: number;
  plateH: number;
  turnCx: number;
  turnW: number;
};

function columnGeo(scene: SharedVsExclusiveScene, index: number): ColumnGeo {
  const colW = PIECE_CANVAS_W / scene.rows.length;
  const x0 = colW * index;
  const stackW = Math.min(STACK_W_MAX, colW * 0.5);
  const stackCx = x0 + colW * 0.38;
  const turnLeft = stackCx + stackW / 2 + 16;
  const turnRight = x0 + colW - 12;
  const turnW = Math.min(TURN_W_MAX, turnRight - turnLeft);
  const turnCx = turnLeft + (turnRight - turnLeft) / 2;
  const maxCap = Math.max(1, ...scene.rows.map((r) => r.cap));
  const room = GROUND_TOP - (DROP_Y + PLATE_H_MAX);
  const plateH = Math.min(PLATE_H_MAX, room / maxCap - PLATE_GAP);
  return { x0, colW, stackCx, stackW, plateH, turnCx, turnW };
}

/** 쌓인 k 번째(0 이 바닥) 장의 가운데 y */
function slotCy(geo: ColumnGeo, k: number): number {
  return GROUND_TOP - PLATE_GAP - k * (geo.plateH + PLATE_GAP) - geo.plateH / 2;
}

function turnedCy(geo: ColumnGeo, k: number): number {
  return GROUND_TOP - PLATE_GAP - k * (geo.plateH + PLATE_GAP + 6) - geo.plateH / 2 - 4;
}

export const sharedVsExclusiveStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    /** 한 시계로 흐르는 운동. frame(p) 에 0..1 을 준다 */
    async function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const start = performance.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const p = Math.min(1, (performance.now() - start) / ms);
        frame(p);
        if (p >= 1) return true;
        await wait(16);
      }
    }

    function txnColor(scene: SharedVsExclusiveScene, txn: string): { vivid: string; pastel: string; deep: string } {
      const i = scene.txns.indexOf(txn);
      if (i < 0) throw new Error(`shared-vs-exclusive stage: 모르는 트랜잭션 '${txn}'`);
      const n = scene.txns.length;
      return {
        vivid: categorical(n, 'vivid')[i]!,
        pastel: categorical(n, 'pastel')[i]!,
        deep: categorical(n, 'deep')[i]!,
      };
    }

    function placeAt(g: SVGGElement, cx: number, cy: number, rot: number, dx = 0): void {
      const r = fmt(rot);
      g.setAttribute(
        'transform',
        `translate(${fmt(cx + dx)} ${fmt(cy)})` + (r === '0' ? '' : ` rotate(${r})`),
      );
    }

    /** 가운데가 (0,0) 인 잠금 한 장 */
    function lockPiece(
      parent: Element,
      scene: SharedVsExclusiveScene,
      geo: ColumnGeo,
      hold: Hold,
      row: string,
      look: 'held' | 'turned',
      struck: boolean,
    ): SVGGElement {
      const g = el(parent, 'g', {});
      const c = txnColor(scene, hold.txn);
      const w = look === 'turned' ? geo.turnW : hold.mode === 'X' ? geo.stackW : geo.stackW * 0.72;
      const h = geo.plateH;
      const heavy = hold.mode === 'X';
      const rect = el(g, 'rect', {
        x: -w / 2,
        y: -h / 2,
        width: w,
        height: h,
        rx: heavy ? 3 : h / 2,
        fill: look === 'turned' ? colors.bgSubtle : heavy ? c.deep : c.pastel,
        stroke: look === 'turned' || struck ? colors.danger : heavy ? c.deep : c.vivid,
        'stroke-width': struck ? 2.5 : 1.5,
      });
      if (look === 'turned') rect.setAttribute('stroke-dasharray', '4 3');
      const label = el(g, 'text', {
        x: 0,
        y: smPx * 0.36,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': heavy ? 700 : 500,
        fill: look === 'turned' ? colors.danger : heavy ? c.pastel : colors.stateInk,
      });
      label.textContent = notation(hold.mode, hold.txn, row);
      return g;
    }

    type Handles = {
      held: Map<string, SVGGElement[]>;
      turned: Map<string, SVGGElement[]>;
    };

    function caption(scene: SharedVsExclusiveScene): string {
      const step = scene.step;
      if (step === null) return t('caption.start', 'No one holds a lock yet.');
      const req = notation(step.mode, step.txn, step.row);
      if (step.kind === 'grant') {
        const row = scene.rows.find((r) => r.name === step.row);
        if (row === undefined) throw new Error(`shared-vs-exclusive stage: 없는 줄 '${step.row}'`);
        return t('caption.grant', 'Granted: {req}. Holders of {row}: {n}', {
          req,
          row: step.row,
          n: row.holders.length,
        });
      }
      return t('caption.block', 'Blocked: {req}. Conflicts with: {held}', {
        req,
        held: step.blockers.map((b) => notation(b.mode, b.txn, step.row)).join(' · '),
      });
    }

    function drawStatic(scene: SharedVsExclusiveScene): Handles {
      svg.textContent = '';
      const handles: Handles = { held: new Map(), turned: new Map() };

      const cap = el(svg, 'text', {
        x: PIECE_CANVAS_W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      cap.textContent = caption(scene);

      scene.rows.forEach((row: RowScene, index) => {
        const geo = columnGeo(scene, index);
        if (index > 0) {
          el(svg, 'line', {
            x1: geo.x0,
            y1: DROP_Y - 8,
            x2: geo.x0,
            y2: COUNT_Y + 6,
            stroke: colors.border,
            'stroke-width': 1,
          });
        }

        // 바닥판 — 줄
        el(svg, 'rect', {
          x: geo.stackCx - geo.stackW / 2 - 8,
          y: GROUND_TOP,
          width: geo.stackW + 16,
          height: SLAB_H,
          rx: 4,
          fill: colors.bgSubtle,
          stroke: colors.text,
          'stroke-width': 1.5,
        });
        const rowLabel = el(svg, 'text', {
          x: geo.stackCx,
          y: GROUND_TOP + SLAB_H / 2 + parseFloat(fontSizes.md) * 0.36,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: colors.text,
        });
        rowLabel.textContent = t('label.row', 'Row {name}', { name: row.name });

        const step = scene.step;
        const struckHere =
          step !== null && step.kind === 'block' && step.row === row.name
            ? new Set(step.blockers.map((b) => b.txn))
            : new Set<string>();

        const heldGs: SVGGElement[] = [];
        row.holders.forEach((hold, k) => {
          const g = lockPiece(svg, scene, geo, hold, row.name, 'held', struckHere.has(hold.txn));
          placeAt(g, geo.stackCx, slotCy(geo, k), 0);
          heldGs.push(g);
        });
        handles.held.set(row.name, heldGs);

        const turnedGs: SVGGElement[] = [];
        row.turned.forEach((turn, k) => {
          const g = lockPiece(svg, scene, geo, turn, row.name, 'turned', false);
          placeAt(g, geo.turnCx, turnedCy(geo, k), TURN_TILT);
          turnedGs.push(g);
        });
        handles.turned.set(row.name, turnedGs);

        const holdCount = el(svg, 'text', {
          x: geo.stackCx,
          y: COUNT_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
        holdCount.textContent = t('label.holders', 'Holders: {n}', { n: row.holders.length });

        const turnCount = el(svg, 'text', {
          x: geo.turnCx,
          y: COUNT_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: row.turned.length > 0 ? colors.danger : colors.textMuted,
        });
        turnCount.textContent = t('label.turned', 'Turned away: {n}', { n: row.turned.length });
      });

      return handles;
    }

    async function render(
      next: SharedVsExclusiveScene,
      prev: SharedVsExclusiveScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(next);
      const step = next.step;
      if (!opts.animate || prev === null || step === null) return;

      const index = next.rows.findIndex((r) => r.name === step.row);
      const row = next.rows[index];
      if (row === undefined) throw new Error(`shared-vs-exclusive stage: 없는 줄 '${step.row}'`);
      const geo = columnGeo(next, index);

      if (step.kind === 'grant') {
        // 떨어져 내려 쌓인다 — 끝 자리에 서 있는 장을 아직 못 온 만큼 위로 올려 둔다
        const gs = handles.held.get(row.name) ?? [];
        const k = row.holders.length - 1;
        const g = gs[k];
        if (g === undefined) throw new Error('shared-vs-exclusive stage: 허락된 장이 그려지지 않았다');
        const endY = slotCy(geo, k);
        const startY = DROP_Y;
        const done = await tween(GRANT_MS, mine, (p) => {
          const e = p * p;
          placeAt(g, geo.stackCx, startY + (endY - startY) * e, 0);
        });
        if (done && mine === gen && !destroyed) drawStatic(next);
        return;
      }

      // 부딪혀 튕겨 난다 — 꼭대기에 닿은 뒤 옆으로 솟았다 기울어진 채 내려앉는다
      const turnedGs = handles.turned.get(row.name) ?? [];
      const k = row.turned.length - 1;
      const g = turnedGs[k];
      if (g === undefined) throw new Error('shared-vs-exclusive stage: 튕겨 난 장이 그려지지 않았다');
      const heldGs = handles.held.get(row.name) ?? [];
      const topCy = slotCy(geo, row.holders.length - 1);
      const contactY = topCy - geo.plateH - PLATE_GAP;
      const endX = geo.turnCx;
      const endY = turnedCy(geo, k);
      const struck = heldGs.filter((_, i) => step.blockers.some((b) => b.txn === row.holders[i]?.txn));
      const HIT = 0.42;

      const done = await tween(BLOCK_MS, mine, (p) => {
        if (p < HIT) {
          const q = p / HIT;
          placeAt(g, geo.stackCx, DROP_Y + (contactY - DROP_Y) * q * q, 0);
          return;
        }
        const q = (p - HIT) / (1 - HIT);
        const e = 1 - (1 - q) * (1 - q);
        const x = geo.stackCx + (endX - geo.stackCx) * e;
        const y = contactY + (endY - contactY) * e - BOUNCE_RISE * Math.sin(Math.PI * q);
        placeAt(g, x, y, TURN_TILT * e);
        const jolt = q >= 1 ? 0 : 3 * Math.sin(q * Math.PI * 4) * (1 - q);
        struck.forEach((sg) => {
          const i = heldGs.indexOf(sg);
          placeAt(sg, geo.stackCx, slotCy(geo, i), 0, jolt);
        });
      });
      if (done && mine === gen && !destroyed) drawStatic(next);
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
