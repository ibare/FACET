/**
 * 방화벽 stage — 왼쪽은 규칙 목록(자리마다 한 줄), 오른쪽은 패킷 여섯의 칸.
 *
 * - 규칙 줄은 자리를 옮긴다. 손잡이로 R2 가 새 자리로 미끄러지면 사이의 줄들이 한 칸씩 비켜선다.
 *   자리 번호(왼쪽 끝)는 움직이지 않는다
 * - 패킷 칸은 자리 × 패킷. 패킷 하나가 위에서 내려가며 지나친 줄에 `–`(맞춰 봤으나 안 맞음)를 남기고,
 *   처음 맞은 줄의 칸에서 멈춘다. 그 아래 칸은 비어 있다 — 그 패킷에게 닿지 않은 줄이다
 * - 칸 왼쪽의 세로 막대가 깊이 표지다. 앞 판의 막대는 점선으로 남아, 새 막대가 그보다 길어지는지 짧아지는지 보인다
 * - 칸 아래 판정 칸은 허용 ↔ 차단으로 뒤집힌다. 색 하나로 가르지 않고 ✓ · ✗ 글자를 함께 쓴다
 * - 한 번도 먼저 맞지 않은 줄에는 가로줄과 표지가 붙는다. 표지는 줄을 따라 자리를 옮긴다
 *
 * 문안은 전부 `params.t` 로 `messages` 에서 온다. 결론을 캡션 글자에 박지 않는다 — 캡션은 projector 가 셈한 값으로 짓는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

type Action = 'allow' | 'deny';

type RuleSpec = { id: string; action: Action; proto: string; src: string; dst: string; port: number | 'any' };
type PacketSpec = { id: string; proto: string; src: string; dst: string; port: number };

/** projector 가 부르는 표면. */
export type FirewallStage = ViewInstance & {
  setOrder(order: string[], ms: number): Promise<void>;
  dropPacket(index: number, depth: number, action: Action, rule: string, ms: number): Promise<void>;
  markDead(dead: string[], ms: number): Promise<void>;
  setCaption(text: string): void;
  reset(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 1000;
const HEAD = 76;
const ROW = 40;
const ROW_Y0 = HEAD + 8;
const SLOT_X = 20;
const ROW_X0 = 34;
const ROW_X1 = 406;
const COL = { id: 44, action: 76, proto: 132, src: 178, dst: 284, port: 368 } as const;
const TAG_X = 410;
const TAG_W = 56;
const PK_X0 = 474;
const PK_W = 87;
const CHIP_W = 28;
const CHIP_H = 18;
const RESULT_H = 22;

const SM = parseFloat(fontSizes.sm);
const XS = parseFloat(fontSizes.xs);
const MD = parseFloat(fontSizes.md);

function heightFor(rows: number): number {
  return ROW_Y0 + rows * ROW + 8 + 40 + 36;
}

function isRule(x: unknown): x is RuleSpec {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    (r.action === 'allow' || r.action === 'deny') &&
    typeof r.proto === 'string' &&
    typeof r.src === 'string' &&
    typeof r.dst === 'string' &&
    (typeof r.port === 'number' || r.port === 'any')
  );
}

function isPacket(x: unknown): x is PacketSpec {
  if (typeof x !== 'object' || x === null) return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.proto === 'string' &&
    typeof p.src === 'string' &&
    typeof p.dst === 'string' &&
    typeof p.port === 'number'
  );
}

function listOf<T>(x: unknown, ok: (v: unknown) => v is T, what: string): T[] {
  if (x === undefined) return [];
  if (!Array.isArray(x)) throw new Error(`firewall-stage: ${what} 가 배열이 아니다`);
  return x.map((v, i) => {
    if (!ok(v)) throw new Error(`firewall-stage: ${what}[${i}] 의 모양이 틀렸다`);
    return v;
  });
}

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export const firewallStageView: CanvasView = {
  canvas: { width: W, height: heightFor(4) },
  mount(_container, params): FirewallStage {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);

    const init = params.initialData ?? {};
    // initialData 가 아예 없으면(전수 검사의 config 만 준 마운트) 빈 판을 그린다. 있는데 모양이 틀리면 던진다.
    const rules: RuleSpec[] = listOf(init.rules, isRule, 'rules');
    const packets: PacketSpec[] = listOf(init.packets, isPacket, 'packets');
    const moving = typeof init.movingRule === 'string' ? init.movingRule : null;
    const nRows = rules.length;
    const H = heightFor(Math.max(nRows, 4));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const rowY = (slot: number) => ROW_Y0 + slot * ROW; // slot 0 부터
    const colX = (i: number) => PK_X0 + i * PK_W;
    const resultY = ROW_Y0 + Math.max(nRows, 4) * ROW + 8;
    const captionY = resultY + 40 + 24;

    // ── 애니메이션 ─────────────────────────────────────────────
    let destroyed = false;
    const frames = new Set<number>();
    const pending = new Set<() => void>();
    const tween = (ms: number, draw: (k: number) => void): Promise<void> =>
      new Promise((resolve) => {
        if (destroyed || isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
          draw(1);
          resolve();
          return;
        }
        const finish = () => {
          pending.delete(finish);
          draw(1);
          resolve();
        };
        pending.add(finish);
        const start = performance.now();
        const tick = (now: number) => {
          if (!pending.has(finish)) return;
          if (destroyed) return finish();
          const k = Math.min(1, (now - start) / ms);
          draw(easeInOut(k));
          if (k >= 1) return finish();
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        tick(start);
      });
    const flushAll = () => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const f of [...pending]) f();
    };
    params.onScrubStart?.(flushAll);

    // ── SVG 헬퍼 ───────────────────────────────────────────────
    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (
      parent: Element,
      x: number,
      y: number,
      s: string,
      o: { size?: number; mono?: boolean; fill?: string; anchor?: string; weight?: number } = {},
    ) => {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.size ?? SM,
          fill: o.fill ?? c.text,
          'text-anchor': o.anchor ?? 'start',
          'dominant-baseline': 'middle',
          'font-weight': o.weight ?? 400,
        },
        parent,
      );
      node.textContent = s;
      return node;
    };
    const actionColor = (a: Action) => (a === 'allow' ? c.success : c.danger);
    const actionLabel = (a: Action) =>
      a === 'allow' ? `✓ ${t('label.allow', 'Allow')}` : `✗ ${t('label.deny', 'Deny')}`;

    const root = el('g', {}, svg);

    // ── 상태 ───────────────────────────────────────────────────
    type Row = { g: SVGGElement; y: number; tag: SVGGElement | null; strike: SVGLineElement | null };
    type Cell = { bg: SVGRectElement; mark: SVGTextElement };
    type Result = {
      g: SVGGElement;
      box: SVGRectElement;
      label: SVGTextElement;
      rule: SVGTextElement;
      action: Action | null;
    };
    type Column = {
      cells: Cell[];
      trail: SVGRectElement;
      ghostTrail: SVGRectElement;
      chip: SVGGElement;
      ghostChip: SVGRectElement;
      depth: number;
      result: Result;
    };
    let rows = new Map<string, Row>();
    let columns: Column[] = [];
    let caption: SVGTextElement | null = null;

    const drawStatic = () => {
      // 머리 — 규칙 칸 이름
      const headY = HEAD - 6;
      text(root, SLOT_X, headY, t('head.slot', 'Pos'), { size: XS, fill: c.textMuted, anchor: 'middle' });
      text(root, COL.id, headY, t('head.rule', 'Rule'), { size: XS, fill: c.textMuted });
      text(root, COL.action, headY, t('head.action', 'Action'), { size: XS, fill: c.textMuted });
      text(root, COL.proto, headY, t('head.proto', 'Proto'), { size: XS, fill: c.textMuted });
      text(root, COL.src, headY, t('head.src', 'Source'), { size: XS, fill: c.textMuted });
      text(root, COL.dst, headY, t('head.dst', 'Destination'), { size: XS, fill: c.textMuted });
      text(root, COL.port, headY, t('head.port', 'Port'), { size: XS, fill: c.textMuted });
      // 자리 번호 — 움직이지 않는다
      for (let s = 0; s < nRows; s++) {
        text(root, SLOT_X, rowY(s) + ROW / 2, String(s + 1), { size: MD, fill: c.textMuted, anchor: 'middle', weight: 600 });
      }
      // 판정 줄 이름
      text(root, ROW_X1, resultY + RESULT_H / 2, t('head.verdict', 'Verdict'), {
        size: XS,
        fill: c.textMuted,
        anchor: 'end',
      });
      text(root, ROW_X1, resultY + 34, t('head.firstMatch', 'First match'), {
        size: XS,
        fill: c.textMuted,
        anchor: 'end',
      });
    };

    const drawRules = () => {
      rows = new Map();
      rules.forEach((r, s) => {
        const y = rowY(s);
        const g = el('g', { transform: `translate(0 ${y})` }, root);
        el(
          'rect',
          {
            x: ROW_X0,
            y: 3,
            width: ROW_X1 - ROW_X0,
            height: ROW - 6,
            rx: 5,
            fill: c.bgSubtle,
            stroke: r.id === moving ? c.accent : c.border,
            'stroke-width': r.id === moving ? 2 : 1,
          },
          g,
        );
        const mid = ROW / 2;
        text(g, COL.id, mid, r.id, { mono: true, weight: 700 });
        text(g, COL.action, mid, actionLabel(r.action), { fill: actionColor(r.action), weight: 600 });
        text(g, COL.proto, mid, r.proto, { mono: true });
        text(g, COL.src, mid, r.src, { mono: true });
        text(g, COL.dst, mid, r.dst, { mono: true });
        text(g, COL.port, mid, String(r.port), { mono: true });
        rows.set(r.id, { g, y, tag: null, strike: null });
      });
    };

    const drawPackets = () => {
      columns = [];
      packets.forEach((p, i) => {
        const x = colX(i);
        const cx = x + PK_W / 2;
        text(root, cx, 12, p.id, { mono: true, weight: 700, anchor: 'middle' });
        text(root, cx, 28, p.src, { mono: true, size: XS, anchor: 'middle', fill: c.textMuted });
        text(root, cx, 42, `→ ${p.dst}`, { mono: true, size: XS, anchor: 'middle', fill: c.textMuted });
        text(root, cx, 56, `${p.proto} ${p.port}`, { mono: true, size: XS, anchor: 'middle', fill: c.textMuted });
        const cells: Cell[] = [];
        for (let s = 0; s < nRows; s++) {
          const bg = el(
            'rect',
            { x: x + 4, y: rowY(s) + 3, width: PK_W - 8, height: ROW - 6, rx: 5, fill: 'none', stroke: c.border },
            root,
          );
          const mark = text(root, cx + 10, rowY(s) + ROW / 2, '', { size: MD, anchor: 'middle', weight: 700 });
          cells.push({ bg, mark });
        }
        const ghostTrail = el(
          'rect',
          { x: x + 8, y: ROW_Y0, width: 3, height: 0, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '3 3' },
          root,
        );
        const trail = el('rect', { x: x + 8, y: ROW_Y0, width: 3, height: 0, fill: c.primary }, root);
        const ghostChip = el(
          'rect',
          {
            x: x + 14,
            y: 0,
            width: CHIP_W,
            height: CHIP_H,
            rx: CHIP_H / 2,
            fill: 'none',
            stroke: c.textMuted,
            'stroke-dasharray': '3 2',
            visibility: 'hidden',
          },
          root,
        );
        const chip = el('g', { transform: `translate(${x + 14} 3)`, visibility: 'hidden' }, root);
        el('rect', { x: 0, y: 0, width: CHIP_W, height: CHIP_H, rx: CHIP_H / 2, fill: c.primary }, chip);
        text(chip, CHIP_W / 2, CHIP_H / 2, p.id, { size: XS, mono: true, anchor: 'middle', fill: c.textInverse, weight: 700 });

        const rg = el('g', {}, root);
        const box = el(
          'rect',
          {
            x: x + 4,
            y: resultY,
            width: PK_W - 8,
            height: RESULT_H,
            rx: 4,
            fill: 'none',
            stroke: c.border,
          },
          rg,
        );
        const label = text(rg, cx, resultY + RESULT_H / 2, '', { size: SM, anchor: 'middle', weight: 700 });
        const rule = text(root, cx, resultY + 34, '', { size: XS, mono: true, anchor: 'middle', fill: c.textMuted });
        columns.push({ cells, trail, ghostTrail, chip, ghostChip, depth: 0, result: { g: rg, box, label, rule, action: null } });
      });
    };

    const build = () => {
      root.replaceChildren();
      drawStatic();
      drawRules();
      drawPackets();
      caption = text(root, ROW_X0, captionY, '', { size: MD, weight: 600 });
    };
    build();

    const chipTop = 3;
    const chipYAt = (depth: number) => rowY(depth - 1) + (ROW - CHIP_H) / 2;

    // ── 표면 ───────────────────────────────────────────────────
    const setOrder = async (order: string[], ms: number): Promise<void> => {
      if (order.length !== rows.size) throw new Error('firewall-stage: 차례의 길이가 규칙 수와 다르다');
      // 앞 판의 흔적을 점선으로 — 새 판의 패킷이 내려오면 하나씩 걷힌다
      for (const col of columns) {
        for (const cell of col.cells) {
          cell.mark.textContent = '';
          cell.bg.setAttribute('stroke', c.border);
          cell.bg.setAttribute('stroke-width', '1');
        }
        if (col.depth > 0) {
          col.ghostTrail.setAttribute('height', String(rowY(col.depth - 1) + ROW - ROW_Y0));
          col.ghostChip.setAttribute('y', String(chipYAt(col.depth)));
          col.ghostChip.setAttribute('visibility', 'visible');
        }
        col.trail.setAttribute('height', '0');
        col.chip.setAttribute('visibility', 'hidden');
        const r = col.result;
        if (r.action !== null) {
          r.box.setAttribute('stroke', c.textMuted);
          r.box.setAttribute('stroke-dasharray', '3 3');
          r.box.setAttribute('stroke-width', '1');
          r.label.setAttribute('fill', c.textMuted);
          r.rule.setAttribute('fill', c.textMuted);
        }
      }
      for (const row of rows.values()) {
        if (row.tag) row.tag.setAttribute('opacity', '0.45');
        if (row.strike) row.strike.setAttribute('stroke-dasharray', '4 4');
      }
      const moves = order.map((id, s) => {
        const row = rows.get(id);
        if (!row) throw new Error(`firewall-stage: 모르는 규칙 ${id}`);
        return { row, from: row.y, to: rowY(s) };
      });
      await tween(ms, (k) => {
        for (const m of moves) {
          m.row.y = m.from + (m.to - m.from) * k;
          m.row.g.setAttribute('transform', `translate(0 ${m.row.y})`);
        }
      });
    };

    const dropPacket = async (index: number, depth: number, action: Action, rule: string, ms: number) => {
      const col = columns[index];
      if (!col) throw new Error(`firewall-stage: 패킷 칸 ${index} 가 없다`);
      if (depth < 1 || depth > nRows) throw new Error(`firewall-stage: 깊이 ${depth} 가 목록 밖이다`);
      const x = colX(index);
      const endY = chipYAt(depth);
      const endTrail = rowY(depth - 1) + ROW - ROW_Y0;
      col.chip.setAttribute('visibility', 'visible');
      const fall = ms * 0.75;
      await tween(fall, (k) => {
        const y = chipTop + (endY - chipTop) * k;
        col.chip.setAttribute('transform', `translate(${x + 14} ${y})`);
        col.trail.setAttribute('height', String(k >= 1 ? endTrail : Math.min(endTrail, Math.max(0, y + CHIP_H - ROW_Y0))));
        // 지나친 줄에는 맞춰 봤으나 안 맞았다는 표지
        for (let s = 0; s < depth - 1; s++) {
          const cell = col.cells[s];
          if (cell && y > rowY(s) + ROW - CHIP_H) cell.mark.textContent = '–';
        }
      });
      for (let s = 0; s < depth - 1; s++) {
        const cell = col.cells[s];
        if (cell) {
          cell.mark.textContent = '–';
          cell.mark.setAttribute('fill', c.textMuted);
        }
      }
      const hit = col.cells[depth - 1];
      if (!hit) throw new Error('firewall-stage: 멈춘 칸이 없다');
      hit.bg.setAttribute('stroke', actionColor(action));
      hit.bg.setAttribute('stroke-width', '2');
      hit.mark.textContent = action === 'allow' ? '✓' : '✗';
      hit.mark.setAttribute('fill', actionColor(action));
      col.ghostChip.setAttribute('visibility', 'hidden');
      col.ghostTrail.setAttribute('height', '0');
      col.depth = depth;

      // 판정 칸 — 바뀌면 뒤집고, 같으면 그대로 굳힌다
      const r = col.result;
      const flip = r.action !== null && r.action !== action;
      const cx = x + PK_W / 2;
      const cy = resultY + RESULT_H / 2;
      const settle = () => {
        r.label.textContent = actionLabel(action);
        r.label.setAttribute('fill', actionColor(action));
        r.box.setAttribute('stroke', actionColor(action));
        r.box.removeAttribute('stroke-dasharray');
        r.box.setAttribute('stroke-width', '2');
        r.rule.textContent = rule;
        r.rule.setAttribute('fill', c.text);
        r.action = action;
      };
      if (flip || r.action === null) {
        let swapped = false;
        await tween(ms - fall, (k) => {
          const s = Math.abs(Math.cos(Math.PI * k));
          if (k >= 0.5 && !swapped) {
            swapped = true;
            settle();
          }
          r.g.setAttribute('transform', `translate(${cx} ${cy}) scale(1 ${Math.max(0.02, s)}) translate(${-cx} ${-cy})`);
        });
        if (!swapped) settle();
        r.g.setAttribute('transform', '');
      } else {
        settle();
      }
    };

    const markDead = async (dead: string[], ms: number) => {
      const adds: Row[] = [];
      const drops: Row[] = [];
      const keeps: Row[] = [];
      for (const [id, row] of rows) {
        if (dead.includes(id)) (row.tag ? keeps : adds).push(row);
        else if (row.tag) drops.push(row);
      }
      for (const id of dead) if (!rows.has(id)) throw new Error(`firewall-stage: 모르는 규칙 ${id}`);
      for (const row of adds) {
        row.strike = el(
          'line',
          { x1: ROW_X0 + 4, x2: ROW_X0 + 4, y1: ROW / 2, y2: ROW / 2, stroke: c.danger, 'stroke-width': 2 },
          row.g,
        );
        const tag = el('g', { transform: `translate(${TAG_X + 40} 0)`, opacity: 0 }, row.g);
        el(
          'rect',
          { x: 0, y: 9, width: TAG_W, height: ROW - 18, rx: 4, fill: 'none', stroke: c.danger, 'stroke-width': 1.5 },
          tag,
        );
        text(tag, TAG_W / 2, ROW / 2, t('label.dead', 'Dead'), { size: XS, fill: c.danger, anchor: 'middle', weight: 700 });
        row.tag = tag;
      }
      for (const row of keeps) {
        row.tag?.setAttribute('opacity', '1');
        row.strike?.removeAttribute('stroke-dasharray');
      }
      await tween(ms, (k) => {
        for (const row of adds) {
          row.tag?.setAttribute('transform', `translate(${TAG_X + 40 * (1 - k)} 0)`);
          row.tag?.setAttribute('opacity', String(k));
          row.strike?.setAttribute('x2', String(ROW_X0 + 4 + (ROW_X1 - ROW_X0 - 8) * k));
        }
        for (const row of drops) {
          row.tag?.setAttribute('transform', `translate(${TAG_X + 40 * k} 0)`);
          row.tag?.setAttribute('opacity', String(0.45 * (1 - k)));
          row.strike?.setAttribute('x1', String(ROW_X0 + 4 + (ROW_X1 - ROW_X0 - 8) * k));
        }
      });
      for (const row of drops) {
        row.tag?.remove();
        row.strike?.remove();
        row.tag = null;
        row.strike = null;
      }
    };

    return {
      setOrder,
      dropPacket,
      markDead,
      setCaption(s: string) {
        if (caption) caption.textContent = s;
      },
      reset() {
        flushAll();
        build();
      },
      destroy() {
        destroyed = true;
        flushAll();
        root.remove();
      },
    };
  },
};
