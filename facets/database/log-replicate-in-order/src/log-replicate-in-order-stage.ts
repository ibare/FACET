/**
 * log-replicate-in-order stage — 위에 리더 로그, 아래에 팔로워 로그를 번호 칸으로 맞춰 세운다.
 *
 * 동사 "거슬러 가서 잇는다":
 *   - 물음(앞 칸 번호 · term · 실은 칸)이 리더의 그 번호 칸에서 내려와 팔로워의 같은 번호 칸 앞에 선다
 *   - 거절이면 물음이 위로 튕겨 올라가 "거절" 표로 남고, nextIndex 표지가 한 칸 왼쪽으로 물러난다
 *   - 맞으면 팔로워의 어긋난 꼬리가 아래로 잘려 떨어진다
 *   - 리더의 칸이 번호 차례로 하나씩 내려와 팔로워 줄에 붙는다
 *
 * 정적 그리기(drawStatic)가 정본이다. 운동은 이미 끝 자리에 선 요소를 "아직 못 온 만큼" 밀어 둔 채 시작한다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { LogScene, SceneEntry } from './scene.js';

const H = 372;
const SVG_NS = 'http://www.w3.org/2000/svg';

const LABEL_W = 76;
const PAD_R = 12;
const CELL_MAX_W = 92;
const CELL_H = 46;
const INDEX_Y = 16;
const LEADER_TOP = 26;
const POINTER_TOP = 76;
const POINTER_TEXT_Y = 98;
const TAG_TOP = 108;
const TAG_H = 22;
const PACKET_TOP = 134;
const PACKET_H = 52;
const FOLLOWER_TOP = 196;
const CUT_TOP = 262;
const CAPTION_Y = 336;
const CAPTION2_Y = 358;
const STRIPE_H = 5;
const MINI = 10;
const MOTION_MS = 600;

const SM_PX = parseFloat(fontSizes.sm);

type Attrs = Record<string, string | number>;

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r === 0 ? 0 : r);
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? fmt(v) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, text: string, attrs: Attrs): SVGTextElement {
  const node = el('text', { x, y, ...attrs }, parent);
  node.textContent = text;
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

type Handles = {
  packet: SVGGElement | null;
  packetLine: SVGLineElement | null;
  tag: SVGGElement | null;
  pointer: SVGGElement | null;
  cut: SVGGElement[];
  followerCells: Map<number, SVGGElement>;
};

export const logReplicateInOrderStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function layout(scene: LogScene): { cols: number; slot: number; cellW: number; colors: readonly string[] } {
      let cols = scene.leader.length + 1;
      let maxTerm = 1;
      for (const e of [...scene.leader, ...scene.follower, ...scene.cut]) {
        cols = Math.max(cols, e.index);
        maxTerm = Math.max(maxTerm, e.term);
      }
      const slot = (W - LABEL_W - PAD_R) / cols;
      const cellW = Math.min(CELL_MAX_W, slot - 8);
      return { cols, slot, cellW, colors: categorical(maxTerm, 'vivid') };
    }

    function drawStatic(scene: LogScene): Handles {
      svg.textContent = '';
      const { cols, slot, cellW, colors } = layout(scene);
      const cx = (i: number): number => LABEL_W + slot * (i - 0.5);
      const termColor = (term: number): string => {
        const col = colors[term - 1];
        if (col === undefined) throw new Error(`log-replicate-in-order stage: term ${term} 의 색이 없다`);
        return col;
      };
      const handles: Handles = {
        packet: null,
        packetLine: null,
        tag: null,
        pointer: null,
        cut: [],
        followerCells: new Map(),
      };

      const lastProbe = scene.probes[scene.probes.length - 1];
      const matched = lastProbe !== undefined && lastProbe.verdict === 'match' ? lastProbe.prev : null;

      function cell(parent: Element, e: SceneEntry, top: number, stroke: string, strokeW: number): SVGGElement {
        const g = el('g', {}, parent);
        const x = cx(e.index) - cellW / 2;
        el('rect', { x, y: top, width: cellW, height: CELL_H, rx: 5, fill: c.bgSubtle, stroke, 'stroke-width': strokeW }, g);
        el('rect', { x: x + 1, y: top + 1, width: cellW - 2, height: STRIPE_H, rx: 3, fill: termColor(e.term) }, g);
        label(g, cx(e.index), top + 20, t('label.term', 'term {n}', { n: e.term }), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        label(g, cx(e.index), top + 38, e.cmd, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        return g;
      }

      function emptySlot(i: number, top: number): void {
        el(
          'rect',
          {
            x: cx(i) - cellW / 2,
            y: top,
            width: cellW,
            height: CELL_H,
            rx: 5,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '4 4',
          },
          svg,
        );
      }

      // 번호 머리
      for (let i = 1; i <= cols; i += 1) {
        label(svg, cx(i), INDEX_Y, t('label.index', '#{i}', { i }), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
      }

      // 줄 이름
      const rowName = (top: number, id: string, role: string): void => {
        label(svg, 8, top + 20, id, {
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: c.text,
        });
        label(svg, 8, top + 37, role, { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted });
      };
      rowName(LEADER_TOP, scene.leaderId, t('label.leader', 'leader'));
      rowName(FOLLOWER_TOP, scene.followerId, t('label.follower', 'follower'));

      // 리더 줄
      const leaderAt = new Set<number>();
      for (const e of scene.leader) {
        leaderAt.add(e.index);
        const hit = matched === e.index;
        cell(svg, e, LEADER_TOP, hit ? c.accent : c.border, hit ? 3 : 1);
      }
      for (let i = 1; i <= cols; i += 1) if (!leaderAt.has(i)) emptySlot(i, LEADER_TOP);

      // 팔로워 줄
      for (let i = 1; i <= cols; i += 1) {
        if (!scene.follower.some((e) => e.index === i)) emptySlot(i, FOLLOWER_TOP);
      }
      for (const e of scene.follower) {
        const hit = matched === e.index;
        handles.followerCells.set(e.index, cell(svg, e, FOLLOWER_TOP, hit ? c.accent : c.border, hit ? 3 : 1));
      }

      // 잘려 나간 꼬리
      if (scene.cut.length > 0) {
        label(svg, 8, CUT_TOP + 28, t('label.deleted', 'deleted'), {
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.danger,
        });
      }
      for (const e of scene.cut) {
        const g = el('g', {}, svg);
        const inner = cell(g, e, CUT_TOP, c.danger, 1);
        inner.setAttribute('opacity', '0.5');
        el(
          'line',
          {
            x1: cx(e.index) - cellW / 2 + 4,
            y1: CUT_TOP + CELL_H / 2,
            x2: cx(e.index) + cellW / 2 - 4,
            y2: CUT_TOP + CELL_H / 2,
            stroke: c.danger,
            'stroke-width': 2,
          },
          g,
        );
        handles.cut.push(g);
      }

      // nextIndex 표지
      if (scene.nextIndex !== null) {
        const g = el('g', {}, svg);
        const x = cx(scene.nextIndex);
        el(
          'path',
          { d: `M ${fmt(x)} ${POINTER_TOP} L ${fmt(x - 6)} ${POINTER_TOP + 9} L ${fmt(x + 6)} ${POINTER_TOP + 9} Z`, fill: c.primary },
          g,
        );
        label(g, x, POINTER_TEXT_Y, t('label.nextIndex', 'nextIndex'), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.primary,
        });
        handles.pointer = g;
      }

      // 물음들
      const written = new Set(scene.written);
      scene.probes.forEach((probe, k) => {
        const x = cx(probe.prev);
        const isLast = k === scene.probes.length - 1;
        if (probe.verdict === 'reject') {
          const g = el('g', {}, svg);
          const w = cellW;
          el('rect', { x: x - w / 2, y: TAG_TOP, width: w, height: TAG_H, rx: TAG_H / 2, fill: c.bg, stroke: c.danger, 'stroke-width': 1.5 }, g);
          label(g, x, TAG_TOP + TAG_H / 2 + SM_PX * 0.35, t('label.rejected', 'rejected'), {
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: c.danger,
          });
          if (isLast) handles.tag = g;
          return;
        }
        const stroke = probe.verdict === 'match' ? c.accent : c.text;
        const line = el(
          'line',
          {
            x1: x,
            y1: LEADER_TOP + CELL_H,
            x2: x,
            y2: PACKET_TOP,
            stroke,
            'stroke-width': 1.5,
            'stroke-dasharray': '3 3',
          },
          svg,
        );
        const g = el('g', {}, svg);
        const w = Math.min(slot - 2, cellW * 1.2);
        el('rect', { x: x - w / 2, y: PACKET_TOP, width: w, height: PACKET_H, rx: 6, fill: c.bg, stroke, 'stroke-width': 2 }, g);
        label(g, x, PACKET_TOP + 15, t('label.index', '#{i}', { i: probe.prev }), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: c.text,
        });
        label(g, x, PACKET_TOP + 29, t('label.probe', 'term {term}?', { term: probe.prevTerm }), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.text,
        });
        const left = probe.carried.filter((e) => !written.has(e.index));
        const span = left.length * MINI + Math.max(0, left.length - 1) * 4;
        left.forEach((e, j) => {
          el(
            'rect',
            {
              x: x - span / 2 + j * (MINI + 4),
              y: PACKET_TOP + 36,
              width: MINI,
              height: MINI,
              rx: 2,
              fill: termColor(e.term),
            },
            g,
          );
        });
        if (isLast) {
          handles.packet = g;
          handles.packetLine = line;
        }
      });

      // 캡션
      const [line1, line2] = caption(scene);
      label(svg, W / 2, CAPTION_Y, line1, {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      });
      if (line2 !== null) {
        label(svg, W / 2, CAPTION2_Y, line2, {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        });
      }

      return handles;
    }

    function caption(scene: LogScene): [string, string | null] {
      const s = scene.step;
      const f = scene.followerId;
      switch (s.kind) {
        case 'init':
          if (s.nextIndex === null) return ['', null];
          return [t('caption.init', "nextIndex = {n} — one past the leader's last entry", { n: s.nextIndex }), null];
        case 'send':
          return [
            t('caption.send', 'AppendEntries — previous entry #{prev}, term {term}', { prev: s.prev, term: s.term }),
            t('caption.carried', 'Entries carried: {n}', { n: s.carried }),
          ];
        case 'reject':
          return [
            s.have === null
              ? t('caption.rejectMissing', '{f} has no entry #{prev} — rejected', { f, prev: s.prev })
              : t('caption.rejectTerm', "{f} entry #{prev} is term {have}, the leader's is term {want} — rejected", {
                  f,
                  prev: s.prev,
                  have: s.have,
                  want: s.want,
                }),
            t('caption.backoff', 'nextIndex {from} → {to}', { from: s.from, to: s.to }),
          ];
        case 'match':
          return [
            t('caption.match', 'Entry #{prev} matches (term {term})', { prev: s.prev, term: s.term }),
            t('caption.cut', '{f} deletes from entry #{from} on · deleted: {n}', { f, from: s.from, n: s.cut }),
          ];
        case 'write':
          return [t('caption.write', '{f} writes entry #{i}: (term {term}, {cmd})', { f, i: s.index, term: s.term, cmd: s.cmd }), null];
        case 'done':
          return [
            t('caption.done', 'Both logs are equal through entry #{n}', { n: s.through }),
            t('caption.tally', 'Sent: {s} · rejected: {r} · deleted: {d} · written: {w}', {
              s: s.sent,
              r: s.rejected,
              d: s.deleted,
              w: s.written,
            }),
          ];
      }
    }

    function tween(mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        let finished = false;
        let id = 0;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          frames.delete(id);
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const tick = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, Math.max(0, (now - start) / MOTION_MS));
          frame(ease(p));
          if (p >= 1) finish();
          else {
            id = requestAnimationFrame(tick);
            frames.add(id);
          }
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    function motion(scene: LogScene, h: Handles): ((e: number) => void) | null {
      const s = scene.step;
      const { slot } = layout(scene);
      const shift = (g: Element | null, dx: number, dy: number): void => {
        if (g === null) return;
        g.setAttribute('transform', `translate(${fmt(dx)} ${fmt(dy)})`);
      };
      switch (s.kind) {
        case 'send': {
          const dy = LEADER_TOP - PACKET_TOP;
          const line = h.packetLine;
          return (e) => {
            shift(h.packet, 0, dy * (1 - e));
            if (line !== null) line.setAttribute('y2', fmt(PACKET_TOP + dy * (1 - e)));
          };
        }
        case 'reject': {
          const dy = PACKET_TOP - TAG_TOP;
          const dx = (s.from - s.to) * slot;
          return (e) => {
            shift(h.tag, 0, dy * (1 - e));
            shift(h.pointer, dx * (1 - e), 0);
          };
        }
        case 'match': {
          const dy = FOLLOWER_TOP - CUT_TOP;
          return (e) => {
            for (const g of h.cut) shift(g, 0, dy * (1 - e));
          };
        }
        case 'write': {
          const dy = LEADER_TOP - FOLLOWER_TOP;
          const g = h.followerCells.get(s.index) ?? null;
          if (g === null) throw new Error(`log-replicate-in-order stage: ${s.index} 번 칸이 팔로워 줄에 없다`);
          return (e) => shift(g, 0, dy * (1 - e));
        }
        case 'init':
        case 'done':
          return null;
      }
    }

    async function render(next: LogScene, _prev: LogScene | null, opts: { animate: boolean }): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const handles = drawStatic(next);
      if (!opts.animate) return;
      const move = motion(next, handles);
      if (move === null) return;
      move(0);
      await tween(mine, move);
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
