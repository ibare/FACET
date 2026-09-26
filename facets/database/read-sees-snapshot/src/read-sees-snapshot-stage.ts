/**
 * read-sees-snapshot-stage — 판 사슬을 틱 자 위의 구간으로 눕히고, 읽는 이를 제 스냅샷 틱에 꽂는다.
 *
 * 판 하나는 제 시작 틱부터 끝 틱까지 덮는 띠 한 칸이다. 트랜잭션은 시작한 틱에 꽂혀 시계가 흘러도
 * 그 자리에 머문다. 읽기는 꽂힌 자리에서 곧게 내려가 그 틱을 덮는 판에 닿고, 그 판의 값을 들고
 * 올라온다 — 같은 줄로 들어간 두 읽기가 서로 다른 칸으로 갈라진다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { SnapshotScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const H = 242;
const CAP1_Y = 20;
const CAP2_Y = 39;
const TAG_TOP = 58;
const TAG_H = 40;
const TAG_W = 108;
const CHIP_W = 40;
const CHIP_GAP = 6;
const RULER_Y = 124;
const TICK_LABEL_Y = 142;
/** 읽기 줄기의 윗머리 — 눈금 숫자 바로 아래에서 내려간다 */
const PLUMB_TOP = TICK_LABEL_Y + 9;
const PEND_TOP = 152;
const PEND_H = 24;
const PEND_W = 48;
const BAND_TOP = 186;
const BAND_H = 34;
/** 왼쪽 이름 자리 */
const X0 = 84;
const MARGIN_R = 16;

const MOVE_MS = { begin: 500, write: 500, commit: 700, read: 800 } as const;

type Refs = {
  cursor: SVGGElement | null;
  elapsed: SVGLineElement | null;
  tags: Map<string, SVGGElement>;
  pending: SVGGElement | null;
  segs: Map<number, SVGRectElement>;
  segLabels: Map<number, { value: SVGTextElement; by: SVGTextElement | null }>;
  plumbs: Map<string, SVGLineElement>;
  chips: Map<string, SVGGElement>;
};

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  opts: { size: string; fill: string; anchor?: string; weight?: string; mono?: boolean },
): SVGTextElement {
  const node = el(parent, 'text', {
    x: r2(x),
    y: r2(y),
    'font-family': opts.mono ? fonts.mono : fonts.body,
    'font-size': opts.size,
    fill: opts.fill,
    'text-anchor': opts.anchor ?? 'start',
    'dominant-baseline': 'middle',
  });
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = text;
  return node;
}

export const readSeesSnapshotStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const xInf = W - MARGIN_R;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function slot(scene: SnapshotScene): number {
      // 틱 자: t0 … lastTick 에 한 칸을 더해 끝 없음(∞) 자리를 둔다.
      return (xInf - X0) / (scene.lastTick - scene.t0 + 1);
    }
    function xAt(scene: SnapshotScene, tick: number): number {
      return X0 + (tick - scene.t0) * slot(scene);
    }
    function chipCx(scene: SnapshotScene, snap: number): number {
      return xAt(scene, snap) + TAG_W / 2 + CHIP_GAP + CHIP_W / 2;
    }

    function caption(scene: SnapshotScene): { one: string; two: string | null } {
      const s = scene.step;
      const tick = scene.tick;
      switch (s.kind) {
        case 'start': {
          const first = scene.versions[0];
          if (!first) throw new Error('판 사슬이 비었다');
          return {
            one: t('caption.start', 'Row {row} before any transaction. Value: {value}.', {
              row: scene.row,
              value: first.value,
            }),
            two: null,
          };
        }
        case 'begin':
          return {
            one: t('caption.begin', 'Tick {tick}: {txn} begins. Snapshot: {snap}.', {
              tick,
              txn: s.txn,
              snap: s.snap,
            }),
            two: null,
          };
        case 'write':
          return {
            one: t('caption.write', 'Tick {tick}: {txn} writes {value}. A new version, not yet committed.', {
              tick,
              txn: s.txn,
              value: s.value,
            }),
            two: null,
          };
        case 'commit': {
          const oldV = scene.versions[s.closed];
          const newV = scene.versions[s.version];
          if (!oldV || !newV) throw new Error('커밋이 가리키는 판이 사슬에 없다');
          return {
            one: t('caption.commit', 'Tick {tick}: {txn} commits. Old value {old} ends here; new value {new} starts here.', {
              tick,
              txn: s.txn,
              old: oldV.value,
              new: newV.value,
            }),
            two: null,
          };
        }
        case 'read': {
          const one = t('caption.read', 'Tick {tick}: {txn} reads with snapshot {snap} → {value}.', {
            tick,
            txn: s.txn,
            snap: s.snap,
            value: s.value,
          });
          const n = scene.reads.length;
          const a = scene.reads[n - 2];
          const b = scene.reads[n - 1];
          if (!a || !b || a.txn === b.txn) return { one, two: null };
          return {
            one,
            two: t('caption.split', 'Same row {row}: {a} → {va}, {b} → {vb}.', {
              row: scene.row,
              a: a.txn,
              va: a.value,
              b: b.txn,
              vb: b.value,
            }),
          };
        }
      }
    }

    function drawStatic(scene: SnapshotScene): Refs {
      svg.textContent = '';
      const refs: Refs = {
        cursor: null,
        elapsed: null,
        tags: new Map(),
        pending: null,
        segs: new Map(),
        segLabels: new Map(),
        plumbs: new Map(),
        chips: new Map(),
      };
      const vivid = categorical(scene.versionTotal, 'vivid');
      const tone = (i: number): string => vivid[i] ?? colors.text;
      const cap = caption(scene);
      label(svg, 12, CAP1_Y, cap.one, { size: fontSizes.md, fill: colors.text });
      if (cap.two !== null) {
        label(svg, 12, CAP2_Y, cap.two, { size: fontSizes.md, fill: colors.text, weight: '600' });
      }

      // 틱 자 — 지난 쪽은 곧은 선, 앞날은 점선.
      label(svg, 12, RULER_Y, t('label.tick', 'tick'), { size: fontSizes.xs, fill: colors.textMuted });
      el(svg, 'line', {
        x1: r2(xAt(scene, scene.t0)),
        y1: RULER_Y,
        x2: r2(xInf),
        y2: RULER_Y,
        stroke: colors.border,
        'stroke-width': 1.5,
        'stroke-dasharray': '4 4',
      });
      refs.elapsed = el(svg, 'line', {
        x1: r2(xAt(scene, scene.t0)),
        y1: RULER_Y,
        x2: r2(xAt(scene, scene.tick)),
        y2: RULER_Y,
        stroke: colors.textMuted,
        'stroke-width': 2,
      });
      for (let k = scene.t0; k <= scene.lastTick; k += 1) {
        const x = xAt(scene, k);
        el(svg, 'line', { x1: r2(x), y1: RULER_Y - 4, x2: r2(x), y2: RULER_Y + 4, stroke: colors.textMuted, 'stroke-width': 1 });
        label(svg, x, TICK_LABEL_Y, String(k), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle', mono: true });
      }
      label(svg, xInf, TICK_LABEL_Y, '∞', { size: fontSizes.sm, fill: colors.textMuted, anchor: 'middle' });

      // 지금 틱 — 눈금 숫자 위에 얹히는 표.
      const cursor = el(svg, 'g', {});
      el(cursor, 'rect', {
        x: -11,
        y: TICK_LABEL_Y - 9,
        width: 22,
        height: 18,
        rx: 4,
        fill: colors.bg,
        stroke: colors.accent,
        'stroke-width': 2.5,
      });
      label(cursor, 0, TICK_LABEL_Y, String(scene.tick), {
        size: fontSizes.xs,
        fill: colors.text,
        anchor: 'middle',
        weight: '700',
        mono: true,
      });
      cursor.setAttribute('transform', `translate(${r2(xAt(scene, scene.tick))},0)`);
      refs.cursor = cursor;

      // 판 사슬 — 커밋된 판은 제 틱 구간을 덮는 띠 한 칸.
      label(svg, 12, BAND_TOP + BAND_H / 2, scene.row, { size: fontSizes.sm, fill: colors.text, weight: '600', mono: true });
      const hit = scene.step.kind === 'read' ? scene.step.version : -1;
      scene.versions.forEach((v, i) => {
        if (v.start === null) return;
        const x1 = xAt(scene, v.start);
        const x2 = v.end === null ? xInf : xAt(scene, v.end);
        const rect = el(svg, 'rect', {
          x: r2(x1),
          y: BAND_TOP,
          width: r2(x2 - x1),
          height: BAND_H,
          rx: 4,
          fill: tone(i),
          'fill-opacity': 0.22,
          stroke: tone(i),
          'stroke-width': i === hit ? 3 : 1.5,
        });
        refs.segs.set(i, rect);
        const value = label(svg, (x1 + x2) / 2, BAND_TOP + BAND_H / 2, String(v.value), {
          size: fontSizes.lg,
          fill: colors.text,
          anchor: 'middle',
          weight: '700',
          mono: true,
        });
        const by =
          v.by === null
            ? null
            : label(svg, x1 + 6, BAND_TOP + BAND_H / 2, v.by, { size: fontSizes.xs, fill: colors.textMuted, mono: true });
        refs.segLabels.set(i, { value, by });
      });

      // 커밋 전의 판 — 사슬 위에 떠 있다. 아직 어느 틱에도 놓이지 않았다.
      scene.versions.forEach((v) => {
        if (v.start !== null) return;
        if (v.wroteAt === null || v.by === null) throw new Error('커밋 전 판에 쓴 이와 쓴 틱이 없다');
        const cx = xAt(scene, v.wroteAt);
        const g = el(svg, 'g', {});
        el(g, 'rect', {
          x: r2(cx - PEND_W / 2),
          y: PEND_TOP,
          width: PEND_W,
          height: PEND_H,
          rx: 4,
          fill: colors.bgSubtle,
          stroke: colors.textMuted,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 3',
        });
        label(g, cx, PEND_TOP + PEND_H / 2, String(v.value), {
          size: fontSizes.md,
          fill: colors.text,
          anchor: 'middle',
          weight: '700',
          mono: true,
        });
        label(g, cx - PEND_W / 2 - 6, PEND_TOP + PEND_H / 2, v.by, {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'end',
          mono: true,
        });
        label(g, cx + PEND_W / 2 + 6, PEND_TOP + PEND_H / 2, t('label.pending', 'uncommitted'), {
          size: fontSizes.xs,
          fill: colors.textMuted,
        });
        refs.pending = g;
      });

      // 읽기 — 꽂힌 틱에서 곧게 내려가 닿은 판.
      for (const rd of scene.reads) {
        const x = xAt(scene, rd.snap);
        const line = el(svg, 'line', {
          x1: r2(x),
          y1: PLUMB_TOP,
          x2: r2(x),
          y2: BAND_TOP,
          stroke: tone(rd.version),
          'stroke-width': 2.5,
        });
        refs.plumbs.set(rd.txn, line);
        el(svg, 'circle', { cx: r2(x), cy: BAND_TOP, r: 4, fill: tone(rd.version) });
      }

      // 트랜잭션 — 시작한 틱에 꽂힌 표.
      for (const sn of scene.snaps) {
        const x = xAt(scene, sn.snap);
        const g = el(svg, 'g', {});
        el(g, 'line', {
          x1: r2(x),
          y1: TAG_TOP + TAG_H,
          x2: r2(x),
          y2: RULER_Y,
          stroke: colors.text,
          'stroke-width': 1.5,
        });
        el(g, 'circle', { cx: r2(x), cy: RULER_Y, r: 4.5, fill: colors.text });
        el(g, 'rect', {
          x: r2(x - TAG_W / 2),
          y: TAG_TOP,
          width: TAG_W,
          height: TAG_H,
          rx: 6,
          fill: colors.bg,
          stroke: colors.text,
          'stroke-width': 1.5,
        });
        label(g, x, TAG_TOP + 13, sn.txn, { size: fontSizes.md, fill: colors.text, anchor: 'middle', weight: '700', mono: true });
        label(g, x, TAG_TOP + 29, t('label.snapshot', 'Snapshot: {n}', { n: sn.snap }), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'middle',
        });
        refs.tags.set(sn.txn, g);
      }

      // 읽어 온 값 — 표 곁에 든다.
      for (const rd of scene.reads) {
        const cx = chipCx(scene, rd.snap);
        const cy = TAG_TOP + TAG_H / 2;
        const g = el(svg, 'g', {});
        el(g, 'rect', {
          x: r2(cx - CHIP_W / 2),
          y: r2(cy - 14),
          width: CHIP_W,
          height: 28,
          rx: 4,
          fill: tone(rd.version),
          'fill-opacity': 0.22,
          stroke: tone(rd.version),
          'stroke-width': 2,
        });
        label(g, cx, cy, String(rd.value), { size: fontSizes.lg, fill: colors.text, anchor: 'middle', weight: '700', mono: true });
        refs.chips.set(rd.txn, g);
      }
      return refs;
    }

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

    /** 한 시계로 흘린다. 세대가 바뀌거나 거두어지면 멈춘다. */
    async function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const t0 = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const p = Math.min(1, (Date.now() - t0) / ms);
        frame(p);
        if (p >= 1) return true;
        await wait(16);
      }
    }

    function move(scene: SnapshotScene, refs: Refs, p: number): void {
      const back = 1 - ease(p);
      // 지금 틱 — 한 칸 앞에서 온다.
      const dx = slot(scene) * back;
      refs.cursor?.setAttribute('transform', `translate(${r2(xAt(scene, scene.tick) - dx)},0)`);
      refs.elapsed?.setAttribute('x2', String(r2(xAt(scene, scene.tick) - dx)));
      const s = scene.step;
      switch (s.kind) {
        case 'start':
          return;
        case 'begin': {
          // 위에서 내려와 제 틱에 꽂힌다.
          refs.tags.get(s.txn)?.setAttribute('transform', `translate(0,${r2(-(TAG_TOP + TAG_H) * back)})`);
          return;
        }
        case 'write': {
          // 틱 자에서 떨어져 나와 사슬 위에 뜬다.
          refs.pending?.setAttribute('transform', `translate(0,${r2((RULER_Y - PEND_TOP) * back)})`);
          return;
        }
        case 'commit': {
          const v = scene.versions[s.version];
          const old = scene.versions[s.closed];
          const seg = refs.segs.get(s.version);
          const oldSeg = refs.segs.get(s.closed);
          if (!v || !old || v.wroteAt === null || v.start === null || old.start === null || !seg || !oldSeg) return;
          // 떠 있던 판이 사슬로 내려앉아 커밋 틱부터 끝까지 펴진다.
          const fromX = xAt(scene, v.wroteAt) - PEND_W / 2;
          const toX = xAt(scene, v.start);
          const e = ease(p);
          const x = fromX + (toX - fromX) * e;
          const w = PEND_W + (xInf - toX - PEND_W) * e;
          seg.setAttribute('x', String(r2(x)));
          seg.setAttribute('width', String(r2(w)));
          const y = PEND_TOP + (BAND_TOP - PEND_TOP) * e;
          const h = PEND_H + (BAND_H - PEND_H) * e;
          seg.setAttribute('y', String(r2(y)));
          seg.setAttribute('height', String(r2(h)));
          const labels = refs.segLabels.get(s.version);
          labels?.value.setAttribute('x', String(r2(x + w / 2)));
          labels?.value.setAttribute('y', String(r2(y + h / 2)));
          labels?.by?.setAttribute('x', String(r2(x + 6)));
          labels?.by?.setAttribute('y', String(r2(y + h / 2)));
          // 옛 판의 오른쪽 끝이 끝 없음에서 커밋 틱으로 잘린다.
          const oldX = xAt(scene, old.start);
          const oldW = toX - oldX + (xInf - toX) * back;
          oldSeg.setAttribute('width', String(r2(oldW)));
          refs.segLabels.get(s.closed)?.value.setAttribute('x', String(r2(oldX + oldW / 2)));
          return;
        }
        case 'read': {
          // 앞 절반: 꽂힌 틱에서 곧게 내려간다. 뒤 절반: 닿은 판의 값을 들고 올라온다.
          const line = refs.plumbs.get(s.txn);
          const chip = refs.chips.get(s.txn);
          const down = ease(Math.min(1, p * 2));
          const up = ease(Math.max(0, p * 2 - 1));
          line?.setAttribute('y2', String(r2(PLUMB_TOP + (BAND_TOP - PLUMB_TOP) * down)));
          if (!chip) return;
          if (p < 0.5) {
            chip.setAttribute('visibility', 'hidden');
          } else {
            chip.removeAttribute('visibility');
          }
          const cx = chipCx(scene, s.snap);
          const cy = TAG_TOP + TAG_H / 2;
          const bx = xAt(scene, s.snap) - cx;
          const by = BAND_TOP + BAND_H / 2 - cy;
          chip.setAttribute('transform', `translate(${r2(bx * (1 - up))},${r2(by * (1 - up))})`);
          return;
        }
      }
    }

    async function render(
      next: SnapshotScene,
      prev: SnapshotScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const refs = drawStatic(next);
      if (!opts.animate || prev === null || next.step.kind === 'start') return;
      const ms = MOVE_MS[next.step.kind];
      move(next, refs, 0);
      const done = await tween(ms, mine, (p) => move(next, refs, p));
      if (!done || mine !== gen || destroyed) return;
      drawStatic(next);
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
