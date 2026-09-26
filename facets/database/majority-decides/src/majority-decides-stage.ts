/**
 * majority-decides 무대 — 사본 수가 과반 문턱을 넘는 순간.
 *
 * 동사는 "문턱을 넘는다". 오른쪽에 노드 수만큼 칸을 쌓은 기둥이 있고 과반 자리에 선이
 * 그어져 있다. 응답이 닿을 때마다 그 팔로워에게서 사본 조각이 날아와 기둥을 한 칸 올린다.
 * 셋째 조각이 선에 닿는 걸음에 선이 굳고 리더에게서 손님으로 ok 가 날아간다. 넷째는 선
 * 위에 얹힐 뿐 아무것도 바꾸지 않고, 멈춘 노드의 칸은 끝까지 빈다.
 *
 * 정적 그리기(`drawStatic`)가 정본이다. 운동은 끝 자리에 이미 선 요소를 "아직 못 온 만큼"
 * 옮겨 놓았다가 0 으로 거둔다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
} from '@ffacet/core/runtime';
import type { MajorityDecidesScene } from './scene';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 (ms) */
const MOVE_MS = 700;
const WRITE_MS = 1000;
const COMMIT_MS = 1250;

type Attrs = Record<string, string | number>;
type Pt = { x: number; y: number };

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

/** p 가 [a, b] 안에서 가는 몫 */
function span(p: number, a: number, b: number): number {
  return ease((p - a) / (b - a));
}

export const majorityDecidesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    const fontMd = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Attrs,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(parent: Element, x: number, y: number, text: string, attrs: Attrs): SVGTextElement {
      const node = el('text', { x, y, 'font-family': fonts.body, ...attrs }, parent);
      node.textContent = text;
      return node;
    }

    /** 글자 폭 짐작 — 넓은 글자(한글 · 한자권 · 가나)는 1em, 나머지는 0.56em */
    function textWidth(s: string, px: number): number {
      let w = 0;
      for (const ch of s) {
        const c = ch.codePointAt(0) ?? 0;
        w += c >= 0x1100 ? px : px * 0.56;
      }
      return w;
    }

    function wrap(s: string, px: number, maxW: number): string[] {
      const words = s.split(' ');
      const lines: string[] = [];
      let cur = '';
      for (const word of words) {
        const cand = cur === '' ? word : `${cur} ${word}`;
        if (cur !== '' && textWidth(cand, px) > maxW) {
          lines.push(cur);
          cur = word;
        } else {
          cur = cand;
        }
      }
      if (cur !== '') lines.push(cur);
      return lines;
    }

    // ---------------------------------------------------------------- 자리
    const pad = 16;
    const meterW = Math.min(110, W * 0.18);
    const meterX = W - pad - meterW;
    const meterTop = 86;
    const bottom = H - 26;
    const regionL = pad;
    const regionR = meterX - 58;

    const leaderW = 138;
    const leaderH = 74;
    const leaderCx = (regionL + regionR) / 2 + 20;
    const leaderTop = meterTop;
    const leaderCy = leaderTop + leaderH / 2;

    const clientW = 70;
    const clientH = 40;
    const clientCx = pad + clientW / 2;

    const fH = 62;
    const fTop = bottom - fH;

    function followerCx(i: number, n: number): number {
      const slot = (regionR - regionL) / n;
      return regionL + slot * (i + 0.5);
    }
    function followerW(n: number): number {
      return Math.min(98, (regionR - regionL) / n - 10);
    }
    /** 보낸 사본이 팔로워 앞에서 머무는 자리 */
    function parked(i: number, n: number): Pt {
      const from: Pt = { x: leaderCx, y: leaderTop + leaderH };
      const to: Pt = { x: followerCx(i, n), y: fTop };
      const y = fTop - 20;
      const k = (y - from.y) / (to.y - from.y);
      return { x: from.x + (to.x - from.x) * k, y };
    }
    function cellH(total: number): number {
      return Math.min(48, (bottom - meterTop) / total);
    }
    function cellCenter(i: number, total: number): Pt {
      const h = cellH(total);
      return { x: meterX + meterW / 2, y: bottom - h * (i + 0.5) };
    }
    const okPark: Pt = { x: (clientCx + clientW / 2 + leaderCx - leaderW / 2) / 2, y: leaderCy };
    const entryCenter: Pt = { x: leaderCx + 12, y: leaderTop + 55 };

    // ---------------------------------------------------------------- 정적 그리기
    type Handles = {
      entry: SVGGElement | null;
      cells: SVGGElement[];
      envelopes: Map<string, SVGGElement>;
      crosses: Map<string, SVGGElement>;
      ok: SVGGElement | null;
      tag: SVGGElement | null;
    };

    /** 로그 칸 한 줄 — 번호 칸 + (term, 명령) 칸 */
    function logSlot(
      parent: Element,
      x: number,
      y: number,
      w: number,
      index: number,
      entry: { term: number; cmd: string } | null,
      committed: boolean,
      muted: boolean,
      size: string,
    ): SVGGElement | null {
      const idxW = 18;
      const h = 20;
      el('rect', { x, y, width: idxW, height: h, rx: 3, fill: colors.bgSubtle, stroke: colors.border }, parent);
      label(parent, x + idxW / 2, y + h / 2 + 4, String(index), {
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      const ex = x + idxW + 4;
      const ew = w - idxW - 4;
      if (entry === null) {
        el(
          'rect',
          {
            x: ex,
            y,
            width: ew,
            height: h,
            rx: 3,
            fill: 'none',
            stroke: muted ? colors.border : colors.textMuted,
            'stroke-dasharray': '3 3',
          },
          parent,
        );
        return null;
      }
      const g = el('g', {}, parent);
      el(
        'rect',
        {
          x: ex,
          y,
          width: ew,
          height: h,
          rx: 3,
          fill: committed ? colors.success : colors.bg,
          stroke: committed ? colors.success : colors.primary,
          'stroke-width': 1.5,
        },
        g,
      );
      label(g, ex + ew / 2, y + h / 2 + 4, t('label.entry', '({term}, {cmd})', { term: entry.term, cmd: entry.cmd }), {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': size,
        fill: committed ? colors.textInverse : colors.text,
      });
      return g;
    }

    function drawStatic(scene: MajorityDecidesScene): Handles {
      svg.textContent = '';
      const handles: Handles = {
        entry: null,
        cells: [],
        envelopes: new Map(),
        crosses: new Map(),
        ok: null,
        tag: null,
      };
      const { base } = scene;
      const n = base.followers.length;
      const committed = scene.committedAt !== null;

      // 캡션
      const lines = wrap(caption(scene), fontMd, W - 2 * pad);
      lines.forEach((line, i) => {
        label(svg, pad, 22 + i * 19, line, { 'font-size': fontSizes.md, fill: colors.text });
      });

      // 리더 → 팔로워 이음
      const wires = el('g', {}, svg);
      base.followers.forEach((f, i) => {
        el(
          'line',
          {
            x1: leaderCx,
            y1: leaderTop + leaderH,
            x2: followerCx(i, n),
            y2: fTop,
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': f.stopped ? '2 4' : 'none',
          },
          wires,
        );
      });

      // 손님
      el(
        'rect',
        {
          x: clientCx - clientW / 2,
          y: leaderCy - clientH / 2,
          width: clientW,
          height: clientH,
          rx: 20,
          fill: colors.bgSubtle,
          stroke: colors.border,
        },
        svg,
      );
      label(svg, clientCx, leaderCy + 4, t('label.client', 'client'), {
        'text-anchor': 'middle',
        'font-size': fontSizes.sm,
        fill: colors.text,
      });

      // 리더
      const lx = leaderCx - leaderW / 2;
      el(
        'rect',
        {
          x: lx,
          y: leaderTop,
          width: leaderW,
          height: leaderH,
          rx: 6,
          fill: colors.bg,
          stroke: colors.primary,
          'stroke-width': 2,
        },
        svg,
      );
      label(svg, lx + 10, leaderTop + 19, base.leader, {
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: colors.text,
      });
      label(svg, lx + leaderW - 10, leaderTop + 19, t('label.leader', 'leader'), {
        'text-anchor': 'end',
        'font-size': fontSizes.xs,
        fill: colors.primary,
      });
      label(svg, lx + 10, leaderTop + 35, t('label.term', 'term {term}', { term: base.term }), {
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      handles.entry = logSlot(
        svg,
        lx + 10,
        leaderTop + 45,
        leaderW - 20,
        scene.entry === null ? 1 : scene.entry.index,
        scene.entry,
        committed,
        false,
        fontSizes.sm,
      );

      // 확정 표
      if (scene.committedAt !== null) {
        const g = el('g', {}, svg);
        label(g, lx + leaderW + 10, leaderTop + 59, t('label.committed', 'committed · {ms} ms', { ms: scene.committedAt }), {
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: colors.success,
        });
        handles.tag = g;
        const okg = el('g', {}, svg);
        el('rect', { x: okPark.x - 16, y: okPark.y - 11, width: 32, height: 22, rx: 11, fill: colors.success }, okg);
        label(okg, okPark.x, okPark.y + 4, t('label.ok', 'ok'), {
          'text-anchor': 'middle',
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: colors.textInverse,
        });
        handles.ok = okg;
      }

      // 팔로워
      const holders = new Set(scene.copies.map((c) => c.node));
      const fw = followerW(n);
      base.followers.forEach((f, i) => {
        const cx = followerCx(i, n);
        const x = cx - fw / 2;
        el(
          'rect',
          {
            x,
            y: fTop,
            width: fw,
            height: fH,
            rx: 6,
            fill: f.stopped ? colors.bgSubtle : colors.bg,
            stroke: f.stopped ? colors.textMuted : colors.border,
            'stroke-dasharray': f.stopped ? '4 3' : 'none',
          },
          svg,
        );
        label(svg, x + 8, fTop + 18, f.id, {
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: f.stopped ? colors.textMuted : colors.text,
        });
        label(svg, x + fw - 8, fTop + 18, f.stopped ? t('label.down', 'down') : t('label.follower', 'follower'), {
          'text-anchor': 'end',
          'font-size': fontSizes.xs,
          fill: f.stopped ? colors.danger : colors.textMuted,
        });
        const has = holders.has(f.id) && scene.entry !== null;
        logSlot(
          svg,
          x + 8,
          fTop + 32,
          fw - 16,
          scene.entry === null ? 1 : scene.entry.index,
          has && scene.entry !== null ? scene.entry : null,
          false,
          f.stopped,
          fontSizes.xs,
        );
        if (scene.silent.includes(f.id)) {
          label(svg, cx, bottom + 17, t('label.noReply', 'no reply'), {
            'text-anchor': 'middle',
            'font-size': fontSizes.xs,
            'font-weight': 700,
            fill: colors.danger,
          });
        }

        // 보냈는데 아직 응답으로 돌아오지 않은 사본
        if (scene.sent.includes(f.id) && !holders.has(f.id) && scene.entry !== null) {
          const p = parked(i, n);
          const lost = scene.lost.includes(f.id);
          const g = el('g', {}, svg);
          const ew = 40;
          el(
            'rect',
            {
              x: p.x - ew / 2,
              y: p.y - 9,
              width: ew,
              height: 18,
              rx: 3,
              fill: lost ? colors.bgSubtle : colors.bg,
              stroke: lost ? colors.textMuted : colors.primary,
            },
            g,
          );
          label(g, p.x, p.y + 4, scene.entry.cmd, {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: lost ? colors.textMuted : colors.text,
          });
          handles.envelopes.set(f.id, g);
          if (lost) {
            const c = el('g', {}, svg);
            const r = 7;
            const cx2 = p.x + ew / 2 + 4;
            const cy2 = p.y - 9;
            el('line', { x1: cx2 - r, y1: cy2 - r, x2: cx2 + r, y2: cy2 + r, stroke: colors.danger, 'stroke-width': 2.5 }, c);
            el('line', { x1: cx2 - r, y1: cy2 + r, x2: cx2 + r, y2: cy2 - r, stroke: colors.danger, 'stroke-width': 2.5 }, c);
            handles.crosses.set(f.id, c);
          }
        }
      });

      // 사본 기둥
      if (base.total !== null && base.majority !== null) {
        const total = base.total;
        const majority = base.majority;
        const h = cellH(total);
        label(
          svg,
          meterX + meterW / 2,
          meterTop - 10,
          t('label.copies', 'copies: {n} / {total}', { n: scene.copies.length, total }),
          { 'text-anchor': 'middle', 'font-size': fontSizes.sm, 'font-weight': 700, fill: colors.text },
        );
        for (let i = 0; i < total; i += 1) {
          el(
            'rect',
            {
              x: meterX + 3,
              y: bottom - h * (i + 1) + 3,
              width: meterW - 6,
              height: h - 6,
              rx: 4,
              fill: 'none',
              stroke: colors.border,
              'stroke-dasharray': '3 3',
            },
            svg,
          );
        }
        scene.copies.forEach((c, i) => {
          // 확정 전: 모이는 중(itemActive) · 확정 뒤: 문턱 아래는 굳은 사본(success), 문턱 위는 덧붙은 사본(외곽선)
          const beyond = committed && i >= majority;
          const g = el('g', {}, svg);
          el(
            'rect',
            {
              x: meterX + 3,
              y: bottom - h * (i + 1) + 3,
              width: meterW - 6,
              height: h - 6,
              rx: 4,
              fill: beyond ? colors.bg : committed ? colors.success : colors.itemActive,
              stroke: beyond ? colors.text : 'none',
              'stroke-width': 1.5,
            },
            g,
          );
          label(g, meterX + meterW / 2, bottom - h * (i + 0.5) + 4, t('label.at', '{node} · {ms} ms', { node: c.node, ms: c.ms }), {
            'text-anchor': 'middle',
            'font-size': fontSizes.xs,
            'font-weight': 700,
            fill: beyond ? colors.text : colors.textInverse,
          });
          handles.cells.push(g);
        });
        const ly = bottom - h * base.majority;
        el(
          'line',
          {
            x1: meterX - 46,
            y1: ly,
            x2: meterX + meterW + 2,
            y2: ly,
            stroke: committed ? colors.success : colors.textMuted,
            'stroke-width': committed ? 3 : 2,
          },
          svg,
        );
        label(svg, meterX - 46, ly - 6, t('label.majority', 'majority: {m}', { m: base.majority }), {
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: committed ? colors.success : colors.textMuted,
        });
      }
      return handles;
    }

    // ---------------------------------------------------------------- 캡션
    function caption(scene: MajorityDecidesScene): string {
      const total = scene.base.total ?? scene.base.followers.length + 1;
      const n = scene.copies.length;
      const step = scene.step;
      switch (step.kind) {
        case 'start': {
          const down = scene.base.followers.filter((f) => f.stopped).map((f) => f.id);
          return t('caption.start', 'Leader: {leader}, term {term}. Log: empty. Down from the start: {down}.', {
            leader: scene.base.leader,
            term: scene.base.term,
            down: down.join(', '),
          });
        }
        case 'write': {
          if (scene.entry === null) return '';
          return t('caption.write', '{ms} ms: write {cmd} arrives at {leader}, goes into log slot {index}. Copies: {n} / {total}.', {
            ms: scene.entry.ms,
            cmd: scene.entry.cmd,
            leader: scene.base.leader,
            index: scene.entry.index,
            n,
            total,
          });
        }
        case 'send':
          return t('caption.send', '{ms} ms: the leader sends {cmd} to every follower. Never arrives: {lost}.', {
            ms: step.ms,
            cmd: scene.base.cmd,
            lost: scene.lost.length === 0 ? '—' : scene.lost.join(', '),
          });
        case 'ack': {
          const m = scene.base.majority;
          if (m === null) return '';
          if (step.effect === 'commit') {
            return t('caption.commit', '{ms} ms: reply from {node}. Copies: {n} / {total}, majority {m} reached — committed, ok to the client.', {
              ms: step.ms,
              node: step.node,
              n,
              total,
              m,
            });
          }
          if (step.effect === 'late') {
            return t('caption.late', '{ms} ms: reply from {node}. Copies: {n} / {total}. Commit time: {at} ms.', {
              ms: step.ms,
              node: step.node,
              n,
              total,
              at: String(scene.committedAt),
            });
          }
          return t('caption.rise', '{ms} ms: reply from {node}. Copies: {n} / {total}, below the majority {m}.', {
            ms: step.ms,
            node: step.node,
            n,
            total,
            m,
          });
        }
        case 'settle':
          if (scene.committedAt === null) {
            return t('caption.settleOpen', 'No reply ever: {silent}. Copies: {n} / {total}, not committed.', {
              silent: scene.silent.join(', '),
              n,
              total,
            });
          }
          return t('caption.settle', 'No reply ever: {silent}. Copies: {n} / {total}, committed at {at} ms.', {
            silent: scene.silent.join(', '),
            n,
            total,
            at: scene.committedAt,
          });
      }
    }

    // ---------------------------------------------------------------- 운동
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function shift(g: SVGGElement | null | undefined, from: Pt, to: Pt, k: number): void {
      if (!g) return;
      const dx = round((from.x - to.x) * (1 - k));
      const dy = round((from.y - to.y) * (1 - k));
      g.setAttribute('transform', `translate(${dx} ${dy})`);
    }

    function motion(scene: MajorityDecidesScene, h: Handles): { ms: number; frame: (p: number) => void } | null {
      const step = scene.step;
      const total = scene.base.total;
      if (total === null) return null;
      const n = scene.base.followers.length;
      const clientPt: Pt = { x: clientCx + clientW / 2, y: leaderCy };
      if (step.kind === 'write') {
        const cell = h.cells[0];
        const cellPt = cellCenter(0, total);
        return {
          ms: WRITE_MS,
          frame: (p) => {
            shift(h.entry, clientPt, entryCenter, span(p, 0, 0.5));
            shift(cell, entryCenter, cellPt, span(p, 0.5, 1));
          },
        };
      }
      if (step.kind === 'send') {
        const from: Pt = { x: leaderCx, y: leaderTop + leaderH };
        return {
          ms: MOVE_MS,
          frame: (p) => {
            scene.base.followers.forEach((f, i) => {
              shift(h.envelopes.get(f.id), from, parked(i, n), ease(p));
              const c = h.crosses.get(f.id);
              if (c) c.setAttribute('opacity', String(round(span(p, 0.85, 1))));
            });
          },
        };
      }
      if (step.kind === 'ack') {
        const i = scene.base.followers.findIndex((f) => f.id === step.node);
        if (i < 0) return null;
        const idx = scene.copies.length - 1;
        const cell = h.cells[idx];
        const from: Pt = { x: followerCx(i, n), y: fTop };
        const to = cellCenter(idx, total);
        if (step.effect !== 'commit') {
          return { ms: MOVE_MS, frame: (p) => shift(cell, from, to, ease(p)) };
        }
        const leaderLeft: Pt = { x: leaderCx - leaderW / 2, y: leaderCy };
        return {
          ms: COMMIT_MS,
          frame: (p) => {
            shift(cell, from, to, span(p, 0, 0.55));
            shift(h.ok, leaderLeft, okPark, span(p, 0.6, 1));
            if (h.tag) h.tag.setAttribute('opacity', String(round(span(p, 0.55, 0.75))));
          },
        };
      }
      return null;
    }

    function stopAll(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const w of [...waiters]) w();
      waiters.clear();
    }

    const renderer: SceneRenderer<MajorityDecidesScene> & { destroy(): void } = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        stopAll();
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        const m = motion(next, h);
        if (m === null) return;
        m.frame(0);
        await tween(m.ms, mine, m.frame);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        stopAll();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
