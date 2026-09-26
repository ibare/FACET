import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { applyChange, commitById, depthOf, diffLines, hunkSpans, nameTarget, parentOf, reachable, type DiffRow, type PickCommit } from './algorithm.js';
import type { PickOneOutScene } from './scene.js';

/**
 * 위: 이력 — 커밋은 부모를 가리키고, 이름표는 커밋 하나에 붙는다.
 * 아래 왼쪽: 고른 커밋의 파일, 그다음 그 부모와 견준 차이. 바뀐 줄 뭉치에 테두리.
 * 아래 오른쪽: HEAD 가 가리키는 이름의 파일. 뭉치가 왼쪽에서 떼어져 건너와 같은 글자의 줄 위에 얹힌다.
 */

const H = 340;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const NODE_R = 14;
const LANE_GAP = 30;
const TOP_LANE_Y = 52;
const PANEL_TOP = 170;
const PANEL_GAP = 28;
const CAPTION_Y = H - 16;
const ROW_H_MAX = 28;

const DIFF_MS = 650;
const FLY_MS = 750;
const SETTLE_MS = 350;
const COMMIT_MS = 650;

const MONO_PX = parseFloat(fontSizes.md);
const MONO_CHAR = MONO_PX * 0.6;
const TAG_PX = parseFloat(fontSizes.sm);
const TAG_CHAR = TAG_PX * 0.6;

const MINUS = '−';

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function node<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(e);
  return e;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

type Layout = {
  lane: Map<string, number>;
  x: Map<string, number>;
  laneY: number[];
  rowH: number;
  rowTop: number;
  leftX: number;
  rightX: number;
  panelW: number;
};

/** 이 장면의 모든 커밋 (새 커밋이 생겼으면 그것까지). */
function allCommits(scene: PickOneOutScene): PickCommit[] {
  return scene.made === null ? scene.commits : [...scene.commits, scene.made];
}

/**
 * 자리 셈. 걸음이 바뀌어도 자리가 흔들리지 않도록 바탕에서만 셈한다:
 * 새 커밋의 자리는 아직 없어도 HEAD 의 커밋 한 칸 뒤로 미리 잡는다.
 */
function layoutOf(scene: PickOneOutScene): Layout {
  if (scene.names.length !== 2) throw new Error(`pick-one-out stage: 이름은 둘이어야 한다 (지금 ${scene.names.length})`);
  const headName = scene.names.find((n) => n.name === scene.head);
  const other = scene.names.find((n) => n.name !== scene.head);
  if (headName === undefined || other === undefined) throw new Error('pick-one-out stage: HEAD 의 이름과 다른 이름을 가를 수 없다');
  const commits = allCommits(scene);
  const fromHead = new Set(reachable(commits, headName.commit));
  const fromOther = new Set(reachable(commits, other.commit));
  const lane = new Map<string, number>();
  const x = new Map<string, number>();
  // 새 커밋이 설 자리(HEAD 의 커밋 한 칸 뒤)까지 넣어 가장 깊은 칸을 정한다.
  let maxDepth = depthOf(commits, headOrigin(scene)) + 1;
  for (const c of commits) maxDepth = Math.max(maxDepth, depthOf(commits, c.id));
  const tagRoom = 96;
  const x0 = PAD + NODE_R + 18;
  const gap = maxDepth === 0 ? 0 : Math.min(120, (W - x0 - tagRoom) / maxDepth);
  for (const c of commits) {
    const inHead = fromHead.has(c.id);
    const inOther = fromOther.has(c.id);
    if (!inHead && !inOther) throw new Error(`pick-one-out stage: 커밋 ${c.id} 는 어느 이름에서도 닿지 않는다`);
    lane.set(c.id, inHead && inOther ? 1 : inHead ? 0 : 2);
    x.set(c.id, x0 + depthOf(commits, c.id) * gap);
  }
  const laneY = [TOP_LANE_Y, TOP_LANE_Y + LANE_GAP, TOP_LANE_Y + LANE_GAP * 2];

  const pickLines = commitById(scene.commits, scene.pick).lines;
  const parent = parentOf(scene.commits, scene.pick);
  const mainLines = commitById(scene.commits, headOrigin(scene)).lines;
  let maxRows = Math.max(pickLines.length, mainLines.length);
  if (parent !== null) {
    const rows = diffLines(commitById(scene.commits, parent).lines, pickLines);
    maxRows = Math.max(maxRows, rows.length, applyChange(mainLines, rows).result.length);
  }
  const rowTop = PANEL_TOP + 26;
  const rowH = Math.min(ROW_H_MAX, (CAPTION_Y - 22 - rowTop) / Math.max(1, maxRows));
  const panelW = (W - PAD * 2 - PANEL_GAP) / 2;
  return { lane, x, laneY, rowH, rowTop, leftX: PAD, rightX: PAD + panelW + PANEL_GAP, panelW };
}

/** HEAD 의 이름이 얹기 전에 가리키던 커밋 — 새 커밋이 생겼으면 그 부모. */
function headOrigin(scene: PickOneOutScene): string {
  if (scene.made !== null) {
    const p = scene.made.parents[0];
    if (p === undefined) throw new Error(`pick-one-out stage: 새 커밋 ${scene.made.id} 에 부모가 없다`);
    return p;
  }
  return nameTarget(scene.names, scene.head);
}

type RowHandle = { g: SVGGElement; op: DiffRow['op'] };

type FrameHandle = { el: SVGRectElement; height: number };
type ArrowEnds = { x1: number; y1: number; x2: number; y2: number };
/** 새 커밋의 손잡이 — 그릴 때 셈한 자리를 함께 담는다. */
type MadeHandle = { node: SVGGElement; cx: number; cy: number; arrow: SVGLineElement; ends: ArrowEnds; head: SVGPolygonElement };

type Handles = {
  leftRows: RowHandle[];
  leftFrames: FrameHandle[];
  rightLayer: SVGGElement;
  made: MadeHandle | null;
  headTags: SVGGElement;
  overlay: SVGGElement;
};

export const pickOneOutStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function drawRow(parent: SVGGElement, x: number, y: number, w: number, rowH: number, row: DiffRow, landed: boolean): SVGGElement {
      const g = node('g', {}, parent);
      const h = rowH - 4;
      const lit = row.op === '+' || landed;
      if (lit) node('rect', { x: x + 6, y: y + 2, width: w - 12, height: h, rx: 3, fill: c.accent }, g);
      const ink = lit ? c.stateInk : row.op === '-' ? c.danger : c.text;
      const mark = row.op === '-' ? MINUS : row.op === '+' || landed ? '+' : '';
      if (mark !== '') {
        const m = node('text', { x: x + 16, y: y + rowH / 2 + 1, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: ink, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, g);
        m.textContent = mark;
      }
      const tx = node('text', { x: x + 28, y: y + rowH / 2 + 1, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: ink, 'dominant-baseline': 'middle' }, g);
      tx.textContent = row.text;
      if (row.op === '-') {
        const len = row.text.length * MONO_CHAR;
        node('line', { x1: x + 26, y1: y + rowH / 2 + 1, x2: x + 30 + len, y2: y + rowH / 2 + 1, stroke: c.danger, 'stroke-width': 1.5 }, g);
      }
      return g;
    }

    function drawTag(parent: Element, cx: number, cy: number, label: string, ghost: boolean): SVGGElement {
      const g = node('g', {}, parent);
      const w = label.length * TAG_CHAR + 12;
      node('rect', {
        x: cx - w / 2, y: cy - 9, width: w, height: 18, rx: 4,
        fill: ghost ? c.bg : c.bgSubtle, stroke: ghost ? c.textMuted : c.text, 'stroke-width': 1,
        ...(ghost ? { 'stroke-dasharray': '3 2' } : {}),
      }, g);
      const tx = node('text', { x: cx, y: cy + 1, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: ghost ? c.textMuted : c.text, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, g);
      tx.textContent = label;
      return g;
    }

    function arrowPoints(fx: number, fy: number, tx: number, ty: number): { x1: number; y1: number; x2: number; y2: number; head: string } {
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      const x1 = fx + ux * NODE_R;
      const y1 = fy + uy * NODE_R;
      const x2 = tx - ux * (NODE_R + 1);
      const y2 = ty - uy * (NODE_R + 1);
      const bx = x2 - ux * 7;
      const by = y2 - uy * 7;
      const head = [
        `${r2(x2)},${r2(y2)}`,
        `${r2(bx - uy * 4)},${r2(by + ux * 4)}`,
        `${r2(bx + uy * 4)},${r2(by - ux * 4)}`,
      ].join(' ');
      return { x1, y1, x2, y2, head };
    }

    function drawStatic(scene: PickOneOutScene): Handles {
      svg.textContent = '';
      const L = layoutOf(scene);
      const commits = allCommits(scene);
      const pos = (id: string): { x: number; y: number } => {
        const x = L.x.get(id);
        const lane = L.lane.get(id);
        const y = lane === undefined ? undefined : L.laneY[lane];
        if (x === undefined || y === undefined) throw new Error(`pick-one-out stage: 커밋 ${id} 의 자리가 없다`);
        return { x, y };
      };

      // 이력 — 화살은 새 커밋에서 부모로.
      const graph = node('g', {}, svg);
      let madeArrow: { line: SVGLineElement; ends: ArrowEnds; head: SVGPolygonElement } | null = null;
      for (const cm of commits) {
        const p = cm.parents[0];
        if (p === undefined) continue;
        const a = pos(cm.id);
        const b = pos(p);
        const ap = arrowPoints(a.x, a.y, b.x, b.y);
        const line = node('line', { x1: ap.x1, y1: ap.y1, x2: ap.x2, y2: ap.y2, stroke: c.textMuted, 'stroke-width': 1.5 }, graph);
        const head = node('polygon', { points: ap.head, fill: c.textMuted }, graph);
        if (scene.made !== null && cm.id === scene.made.id) {
          madeArrow = { line, ends: { x1: ap.x1, y1: ap.y1, x2: ap.x2, y2: ap.y2 }, head };
        }
      }
      const compared = scene.diff === null ? null : scene.diff.parent;
      let madeNode: { g: SVGGElement; cx: number; cy: number } | null = null;
      for (const cm of commits) {
        const { x, y } = pos(cm.id);
        const g = node('g', {}, graph);
        const isPick = cm.id === scene.pick;
        const isMade = scene.made !== null && cm.id === scene.made.id;
        if (cm.id === compared) {
          node('circle', { cx: x, cy: y, r: NODE_R + 5, fill: 'none', stroke: c.accent, 'stroke-width': 2, 'stroke-dasharray': '4 3' }, g);
        }
        node('circle', {
          cx: x, cy: y, r: NODE_R,
          fill: isPick ? c.accent : c.bg,
          stroke: isPick || isMade ? c.accent : c.text,
          'stroke-width': isMade ? 3 : 1.5,
        }, g);
        const label = node('text', { x, y: y + 1, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: isPick ? c.stateInk : c.text, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, g);
        label.textContent = cm.id;
        if (isMade) madeNode = { g, cx: x, cy: y };
      }
      // 이름표 — HEAD 의 이름은 위, 다른 이름은 아래. HEAD 는 그 이름 곁에.
      let headTags: SVGGElement | null = null;
      for (const nm of scene.names) {
        const { x, y } = pos(nm.commit);
        const isHead = nm.name === scene.head;
        const ty = isHead ? y - 30 : y + 30;
        const g = node('g', {}, graph);
        drawTag(g, x, ty, nm.name, false);
        if (isHead) {
          const w = nm.name.length * TAG_CHAR + 12;
          const hw = 'HEAD'.length * TAG_CHAR + 12;
          const hx = x + w / 2 + 14 + hw / 2;
          node('line', { x1: hx - hw / 2, y1: ty, x2: x + w / 2 + 3, y2: ty, stroke: c.textMuted, 'stroke-width': 1 }, g);
          node('polygon', { points: `${r2(x + w / 2 + 1)},${r2(ty)} ${r2(x + w / 2 + 6)},${r2(ty - 3)} ${r2(x + w / 2 + 6)},${r2(ty + 3)}`, fill: c.textMuted }, g);
          drawTag(g, hx, ty, 'HEAD', true);
          headTags = g;
        }
      }

      // 왼쪽 판 — 고른 커밋의 파일, 견준 뒤엔 차이.
      const left = node('g', {}, svg);
      const leftHeader = node('text', { x: L.leftX + 6, y: PANEL_TOP + 8, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted, 'dominant-baseline': 'middle' }, left);
      node('line', { x1: L.leftX, y1: PANEL_TOP + 18, x2: L.leftX + L.panelW, y2: PANEL_TOP + 18, stroke: c.border, 'stroke-width': 1 }, left);
      const leftRows: RowHandle[] = [];
      const leftFrames: FrameHandle[] = [];
      if (scene.diff === null) {
        leftHeader.textContent = t('label.picked', 'File of {pick}', { pick: scene.pick });
        commitById(scene.commits, scene.pick).lines.forEach((text, i) => {
          const row: DiffRow = { op: ' ', text };
          leftRows.push({ g: drawRow(left, L.leftX, L.rowTop + i * L.rowH, L.panelW, L.rowH, row, false), op: ' ' });
        });
      } else {
        const diff = scene.diff;
        leftHeader.textContent = t('label.change', 'Change of {pick} against {parent}', { pick: diff.pick, parent: diff.parent });
        diff.rows.forEach((row, i) => {
          const g = drawRow(left, L.leftX, L.rowTop + i * L.rowH, L.panelW, L.rowH, row, false);
          if (row.op === ' ') g.setAttribute('opacity', '0.55');
          leftRows.push({ g, op: row.op });
        });
        for (const span of hunkSpans(diff.rows)) {
          const height = (span.end - span.start) * L.rowH;
          const el = node('rect', {
            x: L.leftX + 2, y: L.rowTop + span.start * L.rowH, width: L.panelW - 4, height,
            rx: 5, fill: 'none', stroke: c.accent, 'stroke-width': 2,
            ...(scene.landed !== null ? { 'stroke-dasharray': '5 4' } : {}),
          }, left);
          leftFrames.push({ el, height });
        }
      }

      // 오른쪽 판 — HEAD 가 가리키는 이름의 파일.
      const right = node('g', {}, svg);
      const rightHeader = node('text', { x: L.rightX + 6, y: PANEL_TOP + 8, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted, 'dominant-baseline': 'middle' }, right);
      rightHeader.textContent = t('label.file', 'File on {branch}', { branch: scene.head });
      node('line', { x1: L.rightX, y1: PANEL_TOP + 18, x2: L.rightX + L.panelW, y2: PANEL_TOP + 18, stroke: c.border, 'stroke-width': 1 }, right);
      const rightLayer = node('g', {}, right);
      const lines = scene.landed === null ? commitById(scene.commits, headOrigin(scene)).lines : scene.landed.result;
      const lit = new Set<number>();
      if (scene.landed !== null) {
        for (const h of scene.landed.hunks) for (let k = 0; k < h.added.length; k += 1) lit.add(h.at + k);
      }
      lines.forEach((text, i) => {
        drawRow(rightLayer, L.rightX, L.rowTop + i * L.rowH, L.panelW, L.rowH, { op: ' ', text }, lit.has(i));
      });

      // 캡션 — 지금 일어난 일.
      const cap = node('text', { x: W / 2, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, svg);
      cap.textContent = captionOf(scene);

      const overlay = node('g', {}, svg);
      if (headTags === null) throw new Error(`pick-one-out stage: HEAD 의 이름 ${scene.head} 의 이름표를 그리지 못했다`);
      let made: MadeHandle | null = null;
      if (scene.made !== null) {
        const mn: { g: SVGGElement; cx: number; cy: number } | null = madeNode;
        const ma: { line: SVGLineElement; ends: ArrowEnds; head: SVGPolygonElement } | null = madeArrow;
        if (mn === null) throw new Error(`pick-one-out stage: 새 커밋 ${scene.made.id} 의 점을 그리지 못했다`);
        if (ma === null) throw new Error(`pick-one-out stage: 새 커밋 ${scene.made.id} 의 부모 화살을 그리지 못했다`);
        made = { node: mn.g, cx: mn.cx, cy: mn.cy, arrow: ma.line, ends: ma.ends, head: ma.head };
      }
      return { leftRows, leftFrames, rightLayer, made, headTags, overlay };
    }

    function countOps(rows: readonly DiffRow[]): { del: number; add: number } {
      return { del: rows.filter((r) => r.op === '-').length, add: rows.filter((r) => r.op === '+').length };
    }

    function captionOf(scene: PickOneOutScene): string {
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'Picked: {pick} · Lines on {branch}: {n}', {
            pick: scene.pick, branch: scene.head, n: commitById(scene.commits, headOrigin(scene)).lines.length,
          });
        case 'diff': {
          if (scene.diff === null) throw new Error('pick-one-out stage: diff 걸음에 차이가 없다');
          const n = countOps(scene.diff.rows);
          return t('caption.diff', 'Changed block · Removed: {del} · Added: {add}', { del: n.del, add: n.add });
        }
        case 'land': {
          if (scene.landed === null || scene.diff === null) throw new Error('pick-one-out stage: land 걸음에 얹은 결과가 없다');
          const n = countOps(scene.diff.rows);
          return t('caption.land', 'Landed on {branch} · Moved: −{del} +{add} · Lines in file: {n}', {
            branch: scene.landed.branch, del: n.del, add: n.add, n: scene.landed.result.length,
          });
        }
        case 'commit': {
          if (scene.made === null) throw new Error('pick-one-out stage: commit 걸음에 새 커밋이 없다');
          return t('caption.commit', 'New commit {made} · Parent: {parent} · {branch} → {made}', {
            made: scene.made.id, parent: headOrigin(scene), branch: scene.head,
          });
        }
      }
    }

    /** 프레임 수로 흘린다 — 걸어 둔 것은 전부 거둘 수 있게 집합에 담는다. */
    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const total = Math.max(1, Math.round(ms / 16));
        let k = 0;
        let settled = false;
        const finish = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish(false);
          k += 1;
          const p = Math.min(1, k / total);
          frame(p);
          if (p >= 1) return finish(true);
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function animDiff(mine: number, next: PickOneOutScene, h: Handles): Promise<void> {
      if (next.diff === null) throw new Error('pick-one-out stage: diff 걸음에 차이가 없다');
      const L = layoutOf(next);
      // 고른 커밋의 줄(' ' · '+')은 제 옛 자리에서, 부모에만 있던 줄('-')은 왼쪽 밖에서 들어온다.
      const from: { dy: number; dx: number; fade: boolean }[] = [];
      let k = 0;
      next.diff.rows.forEach((row, i) => {
        if (row.op === '-') {
          from.push({ dy: 0, dx: -36, fade: true });
        } else {
          from.push({ dy: (k - i) * L.rowH, dx: 0, fade: false });
          k += 1;
        }
      });
      if (from.length !== h.leftRows.length) throw new Error(`pick-one-out stage: 차이 행 ${from.length} 과 그린 행 ${h.leftRows.length} 이 맞지 않는다`);
      const place = (p: number): void => {
        const e = ease(p);
        h.leftRows.forEach((r, i) => {
          const s = from[i];
          if (s === undefined) throw new Error(`pick-one-out stage: 차이 행 ${i} 의 출발 자리가 없다`);
          r.g.setAttribute('transform', `translate(${r2(s.dx * (1 - e))} ${r2(s.dy * (1 - e))})`);
          if (s.fade) r.g.setAttribute('opacity', String(r2(e)));
        });
        const q = ease(Math.max(0, (p - 0.5) * 2));
        for (const fr of h.leftFrames) fr.el.setAttribute('height', String(r2(fr.height * q)));
      };
      place(0);
      await tween(mine, DIFF_MS, place);
    }

    async function animLand(mine: number, next: PickOneOutScene, h: Handles): Promise<void> {
      if (next.diff === null) throw new Error('pick-one-out stage: land 걸음에 차이가 없다');
      if (next.landed === null) throw new Error('pick-one-out stage: land 걸음에 얹은 결과가 없다');
      const diffRows = next.diff.rows;
      const L = layoutOf(next);
      const spans = hunkSpans(next.diff.rows);
      const before = commitById(next.commits, headOrigin(next)).lines;
      // 얹기 전 파일을 오른쪽에 세운다 — 정적 그림(얹은 뒤)은 잠시 가린다.
      h.rightLayer.setAttribute('opacity', '0');
      const old = node('g', {}, h.overlay);
      const oldRows = before.map((text, i) => drawRow(old, L.rightX, L.rowTop + i * L.rowH, L.panelW, L.rowH, { op: ' ', text }, false));
      // 얹은 순서의 자리를 얹기 전 파일의 자리로 되돌린다.
      let shift = 0;
      const flights = next.landed.hunks.map((hk, i) => {
        const span = spans[i];
        if (span === undefined) throw new Error(`pick-one-out stage: 뭉치 ${i} 의 차이 행이 없다`);
        const origAt = hk.at - shift;
        shift += hk.added.length - hk.removed.length;
        const g = node('g', {}, h.overlay);
        const rows = diffRows.slice(span.start, span.end);
        const minus: SVGGElement[] = [];
        const plus: SVGGElement[] = [];
        rows.forEach((row, j) => {
          const rg = drawRow(g, L.leftX, L.rowTop + (span.start + j) * L.rowH, L.panelW, L.rowH, row, false);
          (row.op === '-' ? minus : plus).push(rg);
        });
        node('rect', {
          x: L.leftX + 2, y: L.rowTop + span.start * L.rowH, width: L.panelW - 4, height: (span.end - span.start) * L.rowH,
          rx: 5, fill: c.bg, 'fill-opacity': 0, stroke: c.accent, 'stroke-width': 2,
        }, g);
        const dx = L.rightX - L.leftX;
        const dy = (origAt - span.start) * L.rowH;
        const covered = oldRows.slice(origAt, origAt + hk.removed.length);
        if (covered.length !== hk.removed.length) {
          throw new Error(`pick-one-out stage: 뭉치 ${i} 가 지울 옛 줄 ${origAt}..${origAt + hk.removed.length - 1} 이 얹기 전 파일(${oldRows.length} 줄)에 없다`);
        }
        return { g, minus, plus, dx, dy, origAt, hk, covered };
      });
      const fly = (p: number): void => {
        const e = ease(p);
        for (const f of flights) f.g.setAttribute('transform', `translate(${r2(f.dx * e)} ${r2(f.dy * e - Math.sin(Math.PI * e) * 18)})`);
      };
      fly(0);
      if (!(await tween(mine, FLY_MS, fly))) return;
      // 얹힘 — 지울 줄이 겹친 옛 줄과 함께 사라지고, 넣을 줄이 그 자리로 오른다. 뒤의 줄은 늘고 준 만큼 밀린다.
      const settle = (p: number): void => {
        const e = ease(p);
        for (const f of flights) {
          for (const m of f.minus) m.setAttribute('opacity', String(r2(1 - e)));
          for (const pl of f.plus) pl.setAttribute('transform', `translate(0 ${r2(-f.hk.removed.length * L.rowH * e)})`);
          for (const row of f.covered) row.setAttribute('opacity', String(r2(1 - e)));
        }
        oldRows.forEach((row, i) => {
          let d = 0;
          for (const f of flights) if (i >= f.origAt + f.hk.removed.length) d += f.hk.added.length - f.hk.removed.length;
          if (d !== 0) row.setAttribute('transform', `translate(0 ${r2(d * L.rowH * e)})`);
        });
      };
      await tween(mine, SETTLE_MS, settle);
    }

    async function animCommit(mine: number, next: PickOneOutScene, h: Handles, from: string): Promise<void> {
      if (next.made === null) throw new Error('pick-one-out stage: commit 걸음에 새 커밋이 없다');
      const made = h.made;
      if (made === null) throw new Error(`pick-one-out stage: 새 커밋 ${next.made.id} 의 손잡이가 없다`);
      const L = layoutOf(next);
      const fx = L.x.get(from);
      if (fx === undefined) throw new Error(`pick-one-out stage: 이름표가 떠난 커밋 ${from} 의 자리가 없다`);
      const dx = fx - made.cx;
      const { ends } = made;
      const step = (p: number): void => {
        const a = ease(Math.min(1, p / 0.45));
        made.node.setAttribute('transform', `translate(${r2(made.cx * (1 - a))} ${r2(made.cy * (1 - a))}) scale(${r2(a)})`);
        const b = ease(Math.max(0, Math.min(1, (p - 0.3) / 0.4)));
        made.arrow.setAttribute('x2', String(r2(lerp(ends.x1, ends.x2, b))));
        made.arrow.setAttribute('y2', String(r2(lerp(ends.y1, ends.y2, b))));
        made.head.setAttribute('opacity', b >= 1 ? '1' : '0');
        const m = ease(Math.max(0, (p - 0.35) / 0.65));
        h.headTags.setAttribute('transform', `translate(${r2(dx * (1 - m))} 0)`);
      };
      step(0);
      await tween(mine, COMMIT_MS, step);
    }

    const renderer: SceneRenderer<PickOneOutScene> = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null) return;
        const step = next.step;
        if (step.kind === 'diff') await animDiff(mine, next, h);
        else if (step.kind === 'land') await animLand(mine, next, h);
        else if (step.kind === 'commit') await animCommit(mine, next, h, step.from);
        else return;
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
