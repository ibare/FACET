/**
 * phantom-read stage — 결과의 모임 안으로 새 줄이 끼어든다.
 *
 * 왼쪽은 표, 오른쪽은 질의마다 결과 칸 하나. 질의가 돌면 조건에 맞는 줄의 사본이 표에서
 * 결과 칸으로 날아가 테 안에 들어서고, 표의 그 줄에 S 잠금 표가 붙는다. INSERT 는 새 줄을
 * 표 아래에서 밀어 올린다. 둘째 질의에서 테는 첫 질의의 크기로 먼저 서 있고, 그 안에
 * 옛 줄이 다시 들어선 뒤 새 줄이 테를 벌리고 끼어든다.
 *
 * 장면이 정본이다 — render 는 늘 drawStatic(next) 로 전부 세우고, 운동은 그 위에서
 * "아직 못 온 만큼" 만 되돌려 그린 뒤 drawStatic(next) 로 끝낸다.
 */
import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView } from '@ffacet/core/runtime';
import type { PhantomReadScene, PhantomResult } from './scene.js';

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';
const FRAME_MS = 16;
const FLIGHT_MS = 380;
const STAGGER_MS = 120;
const RISE_MS = 460;
const DROP_MS = 420;
const DROP_PX = 18;

type Handles = {
  tableRows: Map<number, SVGGElement>;
  resultRows: Map<string, SVGGElement>;
  frames: Map<number, SVGRectElement>;
  rowLabels: Map<number, SVGTextElement>;
  chips: Map<string, SVGGElement>;
  overlay: SVGGElement;
};

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export const phantomReadStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // ── 자리 (캔버스에서 역산) ──────────────────────────────
    const pad = Math.round(W * 0.035);
    const rowsTop = 112;
    const rowsBottom = H - 78;
    const rowW = Math.round(W * 0.24);
    const chipW = Math.round(rowW * 0.25);
    const chipGap = 4;
    const tableX = pad;
    const chipsX = tableX + rowW + 6;
    const colGap = Math.round(W * 0.045);
    const resultsLeft = chipsX + 2 * chipW + chipGap + colGap;

    function geo(scene: PhantomReadScene) {
      const pitch = Math.min(34, (rowsBottom - rowsTop) / Math.max(1, scene.slots));
      const rowH = Math.round(pitch * 0.8);
      const q = Math.max(1, scene.queries);
      const resultW = Math.min(rowW, (W - pad - resultsLeft - (q - 1) * colGap) / q);
      return {
        pitch,
        rowH,
        resultW,
        rowY: (slot: number) => r1(rowsTop + slot * pitch),
        colX: (i: number) => r1(resultsLeft + i * (resultW + colGap)),
        frameH: (rows: number) => (rows <= 0 ? 0 : r1(rows * pitch - (pitch - rowH) + 10)),
      };
    }

    function txnColor(scene: PhantomReadScene, txn: string): string {
      const i = scene.txns.indexOf(txn);
      const palette = categorical(Math.max(1, scene.txns.length), 'vivid');
      return i >= 0 ? palette[i]! : colors.textMuted;
    }

    // ── 그리기 도구 ─────────────────────────────────────────
    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
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
      o: { size?: string; fill?: string; weight?: number; anchor?: string; mono?: boolean },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r1(x),
          y: r1(y),
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.size ?? fontSizes.sm,
          'font-weight': o.weight ?? 400,
          fill: o.fill ?? colors.text,
          'text-anchor': o.anchor ?? 'start',
          'dominant-baseline': 'central',
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function drawRow(
      parent: Element,
      x: number,
      y: number,
      w: number,
      h: number,
      id: number,
      amount: number,
      look: { fill: string; stroke: string; ink: string; dashed: boolean },
    ): SVGGElement {
      const g = el('g', { transform: `translate(${r1(x)},${r1(y)})` }, parent);
      el(
        'rect',
        {
          x: 0,
          y: 0,
          width: r1(w),
          height: h,
          rx: 4,
          fill: look.fill,
          stroke: look.stroke,
          'stroke-width': 1.2,
          ...(look.dashed ? { 'stroke-dasharray': '4 3' } : {}),
        },
        g,
      );
      el('line', { x1: r1(w * 0.4), y1: 3, x2: r1(w * 0.4), y2: h - 3, stroke: look.stroke, 'stroke-width': 1 }, g);
      label(g, w * 0.2, h / 2, String(id), { mono: true, fill: look.ink, anchor: 'middle' });
      label(g, w * 0.7, h / 2, String(amount), { mono: true, fill: look.ink, anchor: 'middle' });
      return g;
    }

    function drawChip(parent: Element, x: number, y: number, h: number, text: string, color: string): SVGGElement {
      const g = el('g', { transform: `translate(${r1(x)},${r1(y)})` }, parent);
      el('rect', { x: 0, y: 0, width: chipW, height: h, rx: h / 2, fill: colors.bg, stroke: color, 'stroke-width': 1.5 }, g);
      label(g, chipW / 2, h / 2, text, { mono: true, size: fontSizes.xs, fill: color, anchor: 'middle', weight: 600 });
      return g;
    }

    function previousOf(scene: PhantomReadScene, index: number): PhantomResult | null {
      const r = scene.results[index]!;
      const before = scene.results.slice(0, index).filter((x) => x.txn === r.txn);
      return before.length > 0 ? before[before.length - 1]! : null;
    }

    function captionLines(scene: PhantomReadScene): string[] {
      const step = scene.step;
      if (step.kind === 'start') {
        if (scene.txns.length === 0) return [];
        return [t('caption.start', 'Isolation of {txn}: {level}. No statement has run yet.', {
          txn: scene.txns[0]!,
          level: scene.isolation,
        })];
      }
      const txn = scene.schedule[scene.stmt]!.txn;
      if (step.kind === 'query') {
        const r = scene.results[step.result]!;
        const vars = { n: r.ordinal, txn, count: r.rows.length, ids: step.locked.join(', ') };
        const first =
          step.locked.length > 0
            ? t('caption.query', 'Query {n} of {txn}. Rows returned: {count}. New S locks on id: {ids}.', vars)
            : t('caption.queryNoLock', 'Query {n} of {txn}. Rows returned: {count}. No new S locks.', vars);
        const prev = previousOf(scene, step.result);
        if (!prev) return [first];
        const kv = { m: prev.ordinal, kept: r.kept.length, prev: prev.rows.length, ids: r.added.join(', ') };
        const second =
          r.added.length > 0
            ? t('caption.kept', 'Rows unchanged since query {m}: {kept}/{prev}. New in the result: id {ids}.', kv)
            : t('caption.keptAll', 'Rows unchanged since query {m}: {kept}/{prev}. Nothing new in the result.', kv);
        return [first, second];
      }
      if (step.kind === 'insert') {
        return [
          t('caption.insert', '{txn} inserts id {id}. X lock on the new row: granted without waiting.', { txn, id: step.id }),
          step.matches
            ? t('caption.fits', 'The new row meets the query condition.')
            : t('caption.misses', 'The new row does not meet the query condition.'),
        ];
      }
      return [t('caption.commit', '{txn} commits. X locks released: {count}.', { txn, count: step.released.length })];
    }

    // ── 정적 그리기 — 장면의 화면 전부 ─────────────────────────
    function drawStatic(scene: PhantomReadScene): Handles {
      svg.textContent = '';
      const g = geo(scene);
      const handles: Handles = {
        tableRows: new Map(),
        resultRows: new Map(),
        frames: new Map(),
        rowLabels: new Map(),
        chips: new Map(),
        overlay: el('g', {}, svg),
      };
      const base = el('g', {}, svg);
      const chipsLayer = el('g', {}, svg);
      const results = el('g', {}, svg);
      svg.appendChild(handles.overlay);

      // 지금 도는 문장
      if (scene.stmt >= 0) {
        const s = scene.schedule[scene.stmt]!;
        const c = txnColor(scene, s.txn);
        const lineH = Math.round(smPx * 2);
        const chip = drawChip(base, pad, 34 - lineH / 2, lineH, s.txn, c);
        chip.setAttribute('data-role', 'stmt-txn');
        label(base, pad + chipW + 10, 34, s.sql, { mono: true, fill: colors.text });
      }

      // 표 머리
      label(base, tableX, rowsTop - 32, scene.tableName, { mono: true, weight: 700, size: fontSizes.md });
      const colHead = (x: number, w: number) => {
        label(base, x + w * 0.2, rowsTop - 12, scene.columns[0], { mono: true, size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle' });
        label(base, x + w * 0.7, rowsTop - 12, scene.columns[1], { mono: true, size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle' });
      };
      colHead(tableX, rowW);

      // 표 줄 · 잠금 표
      const chipH = Math.max(12, g.rowH - 6);
      scene.table.forEach((row, slot) => {
        const y = g.rowY(slot);
        const node = drawRow(base, tableX, y, rowW, g.rowH, row.id, row.amount, {
          fill: row.pendingBy ? colors.bg : colors.bgSubtle,
          stroke: row.pendingBy ? txnColor(scene, row.pendingBy) : colors.border,
          ink: colors.text,
          dashed: row.pendingBy !== null,
        });
        handles.tableRows.set(row.id, node);
        scene.locks
          .filter((l) => l.id === row.id)
          .forEach((l, i) => {
            const chip = drawChip(
              chipsLayer,
              chipsX + i * (chipW + chipGap),
              y + (g.rowH - chipH) / 2,
              chipH,
              `${l.mode} ${l.txn}`,
              txnColor(scene, l.txn),
            );
            handles.chips.set(`${l.id}:${l.txn}:${l.mode}`, chip);
          });
      });

      // 결과 칸
      for (let q = 0; q < scene.queries; q += 1) {
        const x = g.colX(q);
        const r = scene.results[q];
        const c = r ? txnColor(scene, r.txn) : colors.textMuted;
        label(base, x, rowsTop - 32, t('label.query', 'Query {n}', { n: q + 1 }), {
          weight: 600,
          fill: r ? c : colors.textMuted,
          size: fontSizes.md,
        });
        if (!r) continue;
        colHead(x, g.resultW);
        const frame = el(
          'rect',
          {
            x: r1(x - 5),
            y: r1(rowsTop - 5),
            width: r1(g.resultW + 10),
            height: g.frameH(r.rows.length),
            rx: 6,
            fill: 'none',
            stroke: c,
            'stroke-width': 1.6,
          },
          results,
        );
        handles.frames.set(q, frame);
        r.rows.forEach(([id, amount], j) => {
          const intruder = r.added.includes(id);
          const node = drawRow(results, x, g.rowY(j), g.resultW, g.rowH, id, amount, {
            fill: intruder ? colors.accent : colors.bgSubtle,
            stroke: intruder ? colors.accent : colors.border,
            ink: intruder ? colors.stateInk : colors.text,
            dashed: false,
          });
          handles.resultRows.set(`${q}:${id}`, node);
        });
        const rowsLabel = label(
          base,
          x,
          rowsTop - 5 + g.frameH(r.rows.length) + 14,
          t('label.rows', 'Rows: {n}', { n: r.rows.length }),
          { size: fontSizes.xs, fill: colors.textMuted },
        );
        handles.rowLabels.set(q, rowsLabel);
      }

      // 캡션
      captionLines(scene).forEach((line, i) => {
        label(base, pad, H - 46 + i * 22, line, { fill: colors.text, weight: i === 0 ? 400 : 600 });
      });
      return handles;
    }

    // ── 운동 ───────────────────────────────────────────────
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        const total = Math.max(1, Math.round(ms / FRAME_MS));
        let k = 0;
        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = () => done(false);
        waiters.add(wake);
        const tick = () => {
          if (destroyed || mine !== gen) {
            done(false);
            return;
          }
          k += 1;
          frame(k / total);
          if (k >= total) {
            done(true);
            return;
          }
          schedule();
        };
        const schedule = () => {
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        schedule();
      });
    }

    function slotOf(scene: PhantomReadScene, id: number): number {
      const i = scene.table.findIndex((r) => r.id === id);
      if (i < 0) throw new Error(`phantom-read stage: 표에 id ${id} 가 없다`);
      return i;
    }

    async function animateQuery(scene: PhantomReadScene, h: Handles, mine: number): Promise<boolean> {
      if (scene.step.kind !== 'query') return true;
      const q = scene.step.result;
      const r = scene.results[q]!;
      const g = geo(scene);
      const x = g.colX(q);
      const first = previousOf(scene, q) === null;
      // 테는 앞 질의에서 그대로인 줄 수로 먼저 선다. 첫 질의는 비어서 시작한다.
      const baseRows = first ? 0 : r.kept.length;
      const flights = r.rows.map(([id], j) => ({
        node: h.resultRows.get(`${q}:${id}`)!,
        chips: scene.step.kind === 'query' && scene.step.locked.includes(id)
          ? [h.chips.get(`${id}:${r.txn}:S`)].filter((c): c is SVGGElement => c !== undefined)
          : [],
        fromY: g.rowY(slotOf(scene, id)),
        toY: g.rowY(j),
        delay: j * STAGGER_MS,
      }));
      const total = FLIGHT_MS + (flights.length - 1) * STAGGER_MS;
      const frame = h.frames.get(q);
      const rowsLabel = h.rowLabels.get(q);
      const apply = (elapsed: number) => {
        let landed = 0;
        for (const f of flights) {
          const p = ease(clamp01((elapsed - f.delay) / FLIGHT_MS));
          landed += p;
          f.node.setAttribute(
            'transform',
            `translate(${r1(tableX + (x - tableX) * p)},${r1(f.fromY + (f.toY - f.fromY) * p)})`,
          );
          for (const c of f.chips) c.setAttribute('opacity', String(r1(clamp01((elapsed - f.delay) / (FLIGHT_MS / 2)))));
        }
        if (frame) frame.setAttribute('height', String(g.frameH(Math.max(baseRows, landed))));
        if (rowsLabel) rowsLabel.setAttribute('opacity', elapsed >= total ? '1' : '0');
      };
      apply(0);
      return tween(total, mine, (p) => apply(p * total));
    }

    async function animateInsert(scene: PhantomReadScene, h: Handles, mine: number): Promise<boolean> {
      if (scene.step.kind !== 'insert') return true;
      const id = scene.step.id;
      const g = geo(scene);
      const toY = g.rowY(slotOf(scene, id));
      const fromY = H + 4;
      const node = h.tableRows.get(id)!;
      const chips = scene.locks
        .filter((l) => l.id === id)
        .map((l) => ({ c: h.chips.get(`${l.id}:${l.txn}:${l.mode}`)!, i: scene.locks.filter((m) => m.id === id).indexOf(l) }));
      const chipH = Math.max(12, g.rowH - 6);
      const apply = (p: number) => {
        const e = ease(p);
        const y = fromY + (toY - fromY) * e;
        node.setAttribute('transform', `translate(${r1(tableX)},${r1(y)})`);
        for (const { c, i } of chips) {
          c.setAttribute('transform', `translate(${r1(chipsX + i * (chipW + chipGap))},${r1(y + (g.rowH - chipH) / 2)})`);
        }
      };
      apply(0);
      return tween(RISE_MS, mine, apply);
    }

    async function animateCommit(scene: PhantomReadScene, h: Handles, mine: number): Promise<boolean> {
      if (scene.step.kind !== 'commit') return true;
      const g = geo(scene);
      const txn = scene.schedule[scene.stmt]!.txn;
      const chipH = Math.max(12, g.rowH - 6);
      // 놓인 X 표는 다음 장면에 없다 — 줄 곁에서 떨어져 나가는 모습만 겹 위에 잠깐 그린다.
      const ghosts = scene.step.released.map((id) => {
        const i = scene.locks.filter((l) => l.id === id).length;
        const y = g.rowY(slotOf(scene, id)) + (g.rowH - chipH) / 2;
        const x = chipsX + i * (chipW + chipGap);
        return { node: drawChip(h.overlay, x, y, chipH, `X ${txn}`, txnColor(scene, txn)), x, y };
      });
      const apply = (p: number) => {
        const e = ease(p);
        for (const gh of ghosts) {
          gh.node.setAttribute('transform', `translate(${r1(gh.x)},${r1(gh.y + DROP_PX * e)})`);
          gh.node.setAttribute('opacity', String(r1(1 - e)));
        }
      };
      apply(0);
      return tween(DROP_MS, mine, apply);
    }

    return {
      async render(next: PhantomReadScene, _prev: PhantomReadScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const h = drawStatic(next);
        if (!opts.animate) return;
        const kind = next.step.kind;
        const ok =
          kind === 'query'
            ? await animateQuery(next, h, mine)
            : kind === 'insert'
              ? await animateInsert(next, h, mine)
              : kind === 'commit'
                ? await animateCommit(next, h, mine)
                : true;
        if (!ok || destroyed || mine !== gen) return;
        drawStatic(next);
      },
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
