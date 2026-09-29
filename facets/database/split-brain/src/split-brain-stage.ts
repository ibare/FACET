/**
 * split-brain 무대 — 쪼개졌다 붙는 무리와 내려앉는 옛 리더.
 *
 * 노드 다섯이 한 줄로 서고, 저마다 아래로 로그 칸이 쌓인다. 리더는 한 단 올라서 있다.
 * 갈라지면 무리가 실제로 좌우로 벌어지고, 붙으면 다시 모인다. 새 리더는 솟아오르고,
 * 옛 리더는 더 큰 term 을 듣자 내려앉는다. 굳지 못한 칸(점선)은 떨어져 나가고
 * 새 리더의 칸이 옆에서 밀려와 그 자리를 덮는다.
 *
 * 그리기는 늘 장면 전체를 다시 세운다. 운동은 같은 그리기를 진행률과 함께 여러 번 부르는 것이다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import type { SbEntry, SbNode, SplitBrainScene } from './scene.js';

const H = 330;
const SVG = 'http://www.w3.org/2000/svg';

const MARGIN_L = 64;
const MARGIN_R = 16;
const GAP_MAX = 56;
const BOX_MAX = 88;
const BOX_H = 52;
const NODE_Y = 60;
const RISE = 24;
const SLOT_Y0 = 134;
const SLOT_H = 32;
const SLOT_GAP = 8;
const AREA_TOP = 28;
const AREA_BOTTOM = 232;
const CAPTION_Y = 272;
const LINE_H = 22;
const FALL = 70;

/** 걸음 종류마다 운동 길이 (ms) */
const MOTION_MS = {
  partition: 700,
  elect: 600,
  write: 1000,
  heal: 700,
  heartbeat: 1000,
} as const;

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** p 의 [a, b] 구간 진행률 */
function phase(p: number, a: number, b: number): number {
  return ease((p - a) / (b - a));
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** 쪽 나눔에 따른 기둥 가운데 x. side 가 null 이면 한 무리. */
function columnXs(count: number, side: number[] | null): number[] {
  const avail = PIECE_CANVAS_W - MARGIN_L - MARGIN_R;
  if (side === null) {
    const pitch = avail / count;
    return Array.from({ length: count }, (_, i) => MARGIN_L + pitch * (i + 0.5));
  }
  const groups = Math.max(...side) + 1;
  const pitch = (avail - GAP_MAX * (groups - 1)) / count;
  const order = side.map((s, i) => ({ s, i })).sort((a, b) => a.s - b.s || a.i - b.i);
  const xs = new Array<number>(count).fill(0);
  order.forEach((o, k) => {
    xs[o.i] = MARGIN_L + GAP_MAX * o.s + pitch * (k + 0.5);
  });
  return xs;
}

function boxWidth(count: number): number {
  if (count === 0) return BOX_MAX;
  const avail = PIECE_CANVAS_W - MARGIN_L - MARGIN_R;
  const pitch = (avail - GAP_MAX) / count;
  return Math.floor(Math.min(BOX_MAX, pitch - 14));
}

function sameEntry(a: SbEntry, b: SbEntry): boolean {
  return a.term === b.term && a.cmd === b.cmd;
}

export const splitBrainStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Attrs, parent: Element): SVGElement {
      const e = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      parent.appendChild(e);
      return e;
    }
    function label(text: string, attrs: Attrs, parent: Element): SVGElement {
      const e = el('text', { 'font-family': fonts.body, fill: colors.text, ...attrs }, parent);
      e.textContent = text;
      return e;
    }
    function entryText(e: SbEntry): string {
      return t('label.entry', '({term}, {cmd})', { term: e.term, cmd: e.cmd });
    }

    /**
     * 장면을 세운다. k 가 null 이면 정지 화면, 수면 그 걸음의 운동 진행률 (0 → 1).
     */
    function draw(scene: SplitBrainScene, k: number | null): void {
      svg.textContent = '';
      const nodes = scene.nodes;
      const count = nodes.length;
      if (count === 0) return;
      const step = scene.step;
      const bw = boxWidth(count);
      const idx = new Map(nodes.map((n, i) => [n.id, i]));
      const moving = k !== null;

      // 기둥 x — 갈라짐 · 붙음은 앞 쪽 나눔에서 흘러온다
      const toX = columnXs(count, scene.side);
      let xs = toX;
      if (moving && step.kind === 'partition') {
        const from = columnXs(count, null);
        xs = toX.map((x, i) => lerp(from[i] as number, x, ease(k)));
      } else if (moving && step.kind === 'heal') {
        const from = columnXs(count, step.was);
        xs = toX.map((x, i) => lerp(from[i] as number, x, ease(k)));
      }
      const xOf = (id: string): number => {
        const i = idx.get(id);
        if (i === undefined) throw new Error(`split-brain 무대: 모르는 노드 ${id}`);
        return xs[i] as number;
      };

      // 쪽 나눔 — 흐르는 동안은 끝 나눔으로 무리를 묶는다
      const sideNow: number[] | null =
        moving && step.kind === 'heal' ? (k < 1 ? step.was : null) : scene.side;
      const sides = sideNow ?? nodes.map(() => 0);
      const groupCount = Math.max(...sides) + 1;

      // 무리 바탕
      const bgLayer = el('g', {}, svg);
      for (let g = 0; g < groupCount; g += 1) {
        const members = nodes.map((_, i) => i).filter((i) => sides[i] === g);
        if (members.length === 0) continue;
        const left = Math.min(...members.map((i) => xs[i] as number)) - bw / 2 - 8;
        const right = Math.max(...members.map((i) => xs[i] as number)) + bw / 2 + 8;
        el(
          'rect',
          {
            x: left,
            y: AREA_TOP,
            width: right - left,
            height: AREA_BOTTOM - AREA_TOP,
            rx: 10,
            fill: colors.bgSubtle,
            stroke: colors.border,
          },
          bgLayer,
        );
      }
      // 끊긴 자리
      if (sideNow !== null && groupCount > 1) {
        for (let g = 1; g < groupCount; g += 1) {
          const before = nodes.map((_, i) => i).filter((i) => sides[i] === g - 1);
          const after = nodes.map((_, i) => i).filter((i) => sides[i] === g);
          if (before.length === 0 || after.length === 0) continue;
          const cx =
            (Math.max(...before.map((i) => xs[i] as number)) + Math.min(...after.map((i) => xs[i] as number))) / 2;
          const zig: string[] = [];
          const segs = 12;
          for (let s = 0; s <= segs; s += 1) {
            const y = AREA_TOP + ((AREA_BOTTOM - AREA_TOP) * s) / segs;
            const x = cx + (s % 2 === 0 ? -4 : 4);
            zig.push(`${s === 0 ? 'M' : 'L'}${r2(x)} ${r2(y)}`);
          }
          el('path', { d: zig.join(' '), fill: 'none', stroke: colors.danger, 'stroke-width': 2 }, bgLayer);
          label(
            t('label.cut', 'cut'),
            { x: cx, y: AREA_BOTTOM + 14, 'text-anchor': 'middle', 'font-size': fontSizes.xs, fill: colors.danger },
            bgLayer,
          );
        }
      }

      // 칸 번호
      const maxSlots = Math.max(...nodes.map((n) => n.log.length));
      // 칸이 많아지면 세로를 늘리지 않고 간격을 줄인다
      const pitch = Math.min(SLOT_H + SLOT_GAP, (AREA_BOTTOM - 12 - SLOT_Y0) / Math.max(1, maxSlots));
      const cellH = Math.min(SLOT_H, pitch - 4);
      const slotY = (j: number): number => SLOT_Y0 + j * pitch;
      for (let j = 0; j < maxSlots; j += 1) {
        label(
          t('label.slot', 'Slot {n}', { n: j + 1 }),
          {
            x: MARGIN_L - 12,
            y: slotY(j) + cellH / 2 + 4,
            'text-anchor': 'end',
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          svg,
        );
      }

      // 머무는 강조 — 끝 걸음에서 지워지지 않은 확정 칸
      const kept: SbEntry[] = step.kind === 'done' ? step.kept : [];

      const cellLayer = el('g', {}, svg);
      function cell(x: number, y: number, e: SbEntry, solid: boolean, opacity: number, strong: boolean): void {
        const g = el('g', opacity < 1 ? { opacity } : {}, cellLayer);
        el(
          'rect',
          {
            x: x - bw / 2,
            y,
            width: bw,
            height: cellH,
            rx: 5,
            fill: solid ? colors.bgSubtle : colors.bg,
            stroke: strong ? colors.accent : solid ? colors.success : colors.itemComparing,
            'stroke-width': strong ? 3 : 1.6,
            ...(solid ? {} : { 'stroke-dasharray': '5 3' }),
          },
          g,
        );
        label(
          entryText(e),
          {
            x,
            y: y + cellH / 2 + smPx * 0.35,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          },
          g,
        );
      }

      // 로그 칸
      for (const n of nodes) {
        const x = xOf(n.id);
        n.log.forEach((e, j) => {
          const index = j + 1;
          let cx = x;
          let cy = slotY(j);
          let solid = index <= n.commit;
          let show = true;
          if (moving && step.kind === 'write' && index === step.index && step.holders.includes(n.id)) {
            solid = false;
            if (n.id === step.leader) {
              const a = phase(k, 0, 0.4);
              cy = lerp(NODE_Y + BOX_H / 2 - cellH / 2, cy, a);
            } else {
              const b = phase(k, 0.4, 1);
              show = k > 0.4;
              cx = lerp(xOf(step.leader), x, b);
            }
          }
          if (moving && step.kind === 'heartbeat' && n.id === step.node && index >= step.index) {
            const b = phase(k, 0.45, 1);
            show = k > 0.45;
            cx = lerp(xOf(step.from), x, b);
          }
          const strong = kept.some((q) => sameEntry(q, e)) && index <= n.commit;
          if (show) cell(cx, cy, e, solid, 1, strong);
        });
      }
      // 떨어져 나가는 칸
      if (moving && step.kind === 'heartbeat' && k < 1) {
        const a = phase(k, 0, 0.45);
        const x = xOf(step.node);
        step.dropped.forEach((e, d) => {
          cell(x, slotY(step.index - 1 + d) + FALL * a, e, false, 1 - a, false);
        });
      }

      // 노드
      const nodeLayer = el('g', {}, svg);
      for (const n of nodes) {
        const x = xOf(n.id);
        let y = NODE_Y - (n.role === 'leader' ? RISE : 0);
        if (moving && step.kind === 'elect' && n.id === step.candidate) y += RISE * (1 - ease(k));
        if (moving && step.kind === 'heartbeat' && n.id === step.node && step.wasRole === 'leader') {
          y -= RISE * (1 - phase(k, 0, 0.45));
        }
        drawNode(n, x, y, bw, nodeLayer);
      }

      drawCaption(scene);
      drawLegend();
    }

    function drawNode(n: SbNode, x: number, y: number, bw: number, parent: Element): void {
      const leader = n.role === 'leader';
      const g = el('g', {}, parent);
      el(
        'rect',
        {
          x: x - bw / 2,
          y,
          width: bw,
          height: BOX_H,
          rx: 8,
          fill: leader ? colors.bgSubtle : colors.bg,
          stroke: leader ? colors.accent : colors.border,
          'stroke-width': leader ? 3 : 1.4,
        },
        g,
      );
      label(n.id, { x, y: y + 18, 'text-anchor': 'middle', 'font-size': fontSizes.md, 'font-weight': 700 }, g);
      label(
        leader ? t('label.leader', 'leader') : t('label.follower', 'follower'),
        { x, y: y + 32, 'text-anchor': 'middle', 'font-size': fontSizes.xs, fill: colors.textMuted },
        g,
      );
      label(
        t('label.term', 'term {n}', { n: n.term }),
        { x, y: y + 46, 'text-anchor': 'middle', 'font-size': fontSizes.xs, 'font-family': fonts.mono },
        g,
      );
    }

    function leaderList(scene: SplitBrainScene, ids: string[]): string {
      return ids
        .map((id) => {
          const n = scene.nodes.find((q) => q.id === id);
          return n ? t('label.leaderTerm', '{node} (term {term})', { node: id, term: n.term }) : id;
        })
        .join(' · ');
    }

    function drawCaption(scene: SplitBrainScene): void {
      const step = scene.step;
      const lines: string[] = [];
      const total = scene.nodes.length;
      switch (step.kind) {
        case 'start': {
          const ldr = scene.nodes.find((n) => n.role === 'leader');
          if (!ldr) break;
          lines.push(t('caption.start', 'Leader: {leader} · term {term}', { leader: ldr.id, term: ldr.term }));
          for (const c of step.committed) {
            lines.push(
              t('detail.start', 'Slot {slot} {record} · copies: {n} / {total} · committed', {
                slot: c.slot,
                record: entryText(c.entry),
                n: c.copies,
                total,
              }),
            );
          }
          break;
        }
        case 'partition': {
          const side = scene.side ?? [];
          const groups = Math.max(...side) + 1;
          const parts: string[] = [];
          const sizes: number[] = [];
          for (let g = 0; g < groups; g += 1) {
            const ids = scene.nodes.filter((_, i) => side[i] === g).map((n) => n.id);
            parts.push(ids.join(' '));
            sizes.push(ids.length);
          }
          lines.push(t('caption.partition', '{at} ms · the network splits: {groups}', { at: step.at, groups: parts.join(' | ') }));
          lines.push(
            t('detail.partition', 'Majority: {majority} · group sizes: {sizes}', {
              majority: step.majority,
              sizes: sizes.join(' | '),
            }),
          );
          break;
        }
        case 'elect':
          lines.push(
            t('caption.elect', '{at} ms · {node} timer runs out → candidate, term {term}', {
              at: step.timeoutAt,
              node: step.candidate,
              term: step.term,
            }),
          );
          lines.push(
            t('detail.elect', '{at} ms · votes: {votes} ({voters}) · majority: {majority} → leader: {node}', {
              at: step.leaderAt,
              votes: step.voters.length,
              voters: step.voters.join(' '),
              majority: step.majority,
              node: step.candidate,
            }),
          );
          break;
        case 'leaders':
          lines.push(
            t('caption.leaders', 'Leaders: {count} — {list}', {
              count: step.leaders.length,
              list: leaderList(scene, step.leaders.map((l) => l.node)),
            }),
          );
          break;
        case 'write':
          lines.push(
            t('caption.write', '{at} ms · write {cmd} → {leader} (term {term}) · slot {slot}', {
              at: step.at,
              cmd: step.cmd,
              leader: step.leader,
              term: step.term,
              slot: step.index,
            }),
          );
          lines.push(
            step.committed
              ? t('detail.write.ok', 'Copies: {n} / {total} ({holders}) · majority: {majority} → committed', {
                  n: step.holders.length,
                  total,
                  holders: step.holders.join(' '),
                  majority: step.majority,
                })
              : t('detail.write.no', 'Copies: {n} / {total} ({holders}) · majority: {majority} → not committed', {
                  n: step.holders.length,
                  total,
                  holders: step.holders.join(' '),
                  majority: step.majority,
                }),
          );
          break;
        case 'heal':
          lines.push(t('caption.heal', '{at} ms · the network heals', { at: step.at }));
          lines.push(
            t('caption.leaders', 'Leaders: {count} — {list}', {
              count: step.leaders.length,
              list: leaderList(scene, step.leaders.map((l) => l.node)),
            }),
          );
          break;
        case 'heartbeat':
          lines.push(
            t('caption.heartbeat', '{at} ms · heartbeat from {from} (term {term}) → {node}', {
              at: step.at,
              from: step.from,
              term: step.term,
              node: step.node,
            }),
          );
          lines.push(
            step.wasRole === 'leader'
              ? t('detail.stepDown', '{node}: leader → follower · term {was} → {now}', {
                  node: step.node,
                  was: step.wasTerm,
                  now: step.term,
                })
              : t('detail.term', '{node}: term {was} → {now}', { node: step.node, was: step.wasTerm, now: step.term }),
          );
          if (step.dropped.length > 0) {
            lines.push(
              t('detail.replace', 'Slot {slot}: {dropped} erased · {written} written', {
                slot: step.index,
                dropped: step.dropped.map(entryText).join(' '),
                written: step.written.map(entryText).join(' '),
              }),
            );
          }
          break;
        case 'done':
          lines.push(
            t('caption.leaders', 'Leaders: {count} — {list}', {
              count: step.leaders.length,
              list: leaderList(scene, step.leaders),
            }),
          );
          lines.push(
            t('detail.done', 'Same log: {n} / {total} · committed up to slot {slot}', {
              n: step.same,
              total,
              slot: step.commit,
            }),
          );
          if (step.kept.length > 0) {
            lines.push(
              t('detail.kept', 'Committed and never erased: {entries}', {
                entries: step.kept.map(entryText).join(' '),
              }),
            );
          }
          break;
      }
      lines.forEach((line, i) => {
        label(line, {
          x: PIECE_CANVAS_W / 2,
          y: CAPTION_Y + i * LINE_H,
          'text-anchor': 'middle',
          'font-size': i === 0 ? fontSizes.md : fontSizes.sm,
          fill: i === 0 ? colors.text : colors.textMuted,
          ...(i === 0 ? { 'font-weight': 600 } : {}),
        }, svg);
      });
    }

    function drawLegend(): void {
      const g = el('g', {}, svg);
      const y = 6;
      let x = MARGIN_L - 48;
      el('rect', { x, y, width: 18, height: 12, rx: 3, fill: colors.bgSubtle, stroke: colors.success, 'stroke-width': 1.6 }, g);
      label(t('label.committed', 'committed'), { x: x + 24, y: y + 10, 'font-size': fontSizes.xs, fill: colors.textMuted }, g);
      x += 24 + 96;
      el(
        'rect',
        {
          x,
          y,
          width: 18,
          height: 12,
          rx: 3,
          fill: colors.bg,
          stroke: colors.itemComparing,
          'stroke-width': 1.6,
          'stroke-dasharray': '5 3',
        },
        g,
      );
      label(t('label.uncommitted', 'not committed'), { x: x + 24, y: y + 10, 'font-size': fontSizes.xs, fill: colors.textMuted }, g);
    }

    function drawStatic(scene: SplitBrainScene): void {
      draw(scene, null);
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    async function play(scene: SplitBrainScene, ms: number, mine: number): Promise<void> {
      const start = Date.now();
      draw(scene, 0);
      for (;;) {
        if (mine !== gen || destroyed) return;
        await wait(16);
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - start) / ms);
        draw(scene, p);
        if (p >= 1) return;
      }
    }

    return {
      async render(next: SplitBrainScene, _prev: SplitBrainScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const kind = next.step.kind;
        const ms =
          kind === 'partition' || kind === 'elect' || kind === 'write' || kind === 'heal' || kind === 'heartbeat'
            ? MOTION_MS[kind]
            : 0;
        if (!opts.animate || ms === 0) {
          drawStatic(next);
          return;
        }
        await play(next, ms, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
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
