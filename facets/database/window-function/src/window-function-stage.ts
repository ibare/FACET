/**
 * window-function 무대 — 왼쪽은 윈도 결과(줄을 남긴다), 오른쪽은 GROUP BY 결과(줄을 접는다).
 *
 * 운동
 *   - gather   줄이 id 차례에서 묶음 차례로 자리를 옮긴다 (앞 판에서 이미 모여 있으면 그대로)
 *   - frames   줄마다 틀 괄호가 앞뒤로 벌어지거나 좁아지고, near 칸의 수가 새 합으로 굴러 바뀐다.
 *              앞 판의 괄호 · 값에서 새 판의 괄호 · 값으로 옮겨 간다
 *   - fold     묶음의 km 가 GROUP BY 쪽 제 묶음 줄로 날아가 한 줄로 접히고, total 이 굴러 커진다
 *   - link     near 가 total 과 같은 줄에서 제 묶음 줄로 선이 뻗는다
 *
 * 무대는 셈하지 않는다 — 틀의 첫 · 끝 줄, near · total, 같은 줄 여부는 모두 payload 로 온다.
 * 자리(좌표)만 스스로 정한다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

// ── 자료 모양 (projector 가 좁혀서 건넨다)

export type WindowFunctionStageRow = { id: number; team: string; km: number };

export type WindowFunctionTableView = {
  clause: string;
  rows: WindowFunctionStageRow[];
  columns: string[];
  alias: string;
  groupAlias: string;
  windowSql: { head: string[]; close: string; tail: string[] };
  groupSql: string[];
};

export type WindowFunctionGatherView = {
  slots: { row: number; part: number; pos: number }[];
  parts: { team: string; size: number }[];
  widest: number;
};

export type WindowFunctionFramesView = {
  part: number;
  rows: { row: number; lo: number; hi: number; near: number }[];
};

export type WindowFunctionFoldView = {
  groups: { team: string; total: number; rows: number[] }[];
};

export type WindowFunctionLinkView = {
  links: { row: number; part: number }[];
};

/** projector 가 부르는 무대의 표면 */
export type WindowFunctionStage = {
  showTable(v: WindowFunctionTableView, durMs: number): void;
  gather(v: WindowFunctionGatherView, durMs: number): void;
  showFrames(v: WindowFunctionFramesView, durMs: number): void;
  fold(v: WindowFunctionFoldView, durMs: number): void;
  link(v: WindowFunctionLinkView, durMs: number): void;
  setCaption(text: string): void;
  clear(): void;
};

// ── 자리

const W = 720;
const H = 480;
const SQL_X = 16;
const GROUP_X = 470;
const SQL_TOP = 26;
const TITLE_Y = 150;
const HEAD_Y = 172;
const ROW0 = 184;
const RH = 26;
const PART_GAP = 10;
const COL_ID = 16;
const COL_TEAM = 56;
const COL_KM = 120;
const LANES_X = 172;
const LANES_W = 64;
const COL_NEAR = 244;
const NEAR_W = 56;
const G_TEAM = GROUP_X;
const G_TOTAL = GROUP_X + 76;
const G_W = 140;
const CAPTION_Y = 466;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

type RowDraw = {
  g: SVGGElement;
  y: number;
  nearText: SVGTextElement;
  nearBox: SVGRectElement;
  near: number | null;
  shownNear: number | null;
  stale: boolean;
  bracket: SVGPathElement;
  top: number | null;
  bottom: number | null;
  lane: number;
};

type GroupDraw = {
  g: SVGGElement;
  box: SVGRectElement;
  teamText: SVGTextElement;
  totalText: SVGTextElement;
  total: number;
  shown: number;
  y: number;
};

export const windowFunctionStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const charW = parseFloat(fontSizes.sm) * 0.6;
    const lineH = parseFloat(fontSizes.sm) + 5;

    const root = el('g', {}, svg);
    const sqlLayer = el('g', {}, root);
    const headLayer = el('g', {}, root);
    const linkLayer = el('g', {}, root);
    const rowLayer = el('g', {}, root);
    const groupLayer = el('g', {}, root);
    const ghostLayer = el('g', {}, root);
    const caption = el(
      'text',
      { x: SQL_X, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: pal.text },
      root,
    );

    // ── 운동 (rAF). 같은 열쇠의 새 운동은 앞 운동을 끊고 지금 값에서 이어 간다
    const frames = new Map<string, number>();
    const hasRaf = typeof requestAnimationFrame === 'function';
    const tween = (key: string, durMs: number, step: (u: number) => void, done?: () => void) => {
      const prev = frames.get(key);
      if (prev !== undefined && hasRaf) cancelAnimationFrame(prev);
      frames.delete(key);
      if (!hasRaf || durMs <= 0) {
        step(1);
        done?.();
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const u = Math.min(1, (now - start) / durMs);
        step(ease(u));
        if (u < 1) frames.set(key, requestAnimationFrame(tick));
        else {
          frames.delete(key);
          done?.();
        }
      };
      frames.set(key, requestAnimationFrame(tick));
    };

    // ── 상태
    let rows: WindowFunctionStageRow[] = [];
    let draws: RowDraw[] = [];
    let slots: { part: number; pos: number }[] | null = null;
    let parts: { team: string; size: number }[] = [];
    let laneW = LANES_W / 4;
    let teamColors: readonly string[] = [];
    let groups: GroupDraw[] = [];
    let links = new Map<number, SVGPathElement>();
    let clauseKey = '';

    const colorOf = (part: number): string => {
      const c = teamColors[part];
      if (c === undefined) throw new Error('window-function-stage: 묶음 색이 없다');
      return c;
    };
    const teamColor = (row: number): string => (slots ? colorOf(slots[row].part) : pal.textMuted);

    const rowTop = (row: number): number => {
      if (!slots) return ROW0 + row * RH;
      const s = slots[row];
      let before = 0;
      for (let p = 0; p < s.part; p += 1) before += parts[p].size;
      return ROW0 + (before + s.pos) * RH + s.part * PART_GAP;
    };

    const setRowY = (d: RowDraw, y: number) => {
      d.y = y;
      d.g.setAttribute('transform', `translate(0 ${y})`);
    };

    const drawBracket = (row: number) => {
      const d = draws[row];
      if (d.top === null || d.bottom === null) {
        d.bracket.setAttribute('d', '');
        return;
      }
      const x = LANES_X + d.lane * laneW + laneW / 2;
      const mid = d.y + RH / 2;
      const top = d.top;
      const bottom = d.bottom;
      d.bracket.setAttribute(
        'd',
        `M ${x + 4} ${top} L ${x} ${top} L ${x} ${bottom} L ${x + 4} ${bottom} M ${x} ${mid} L ${COL_NEAR - 2} ${mid}`,
      );
      d.bracket.setAttribute('stroke', d.stale ? pal.border : teamColor(row));
    };

    const drawNear = (d: RowDraw) => {
      d.nearText.textContent = d.shownNear === null ? '' : String(Math.round(d.shownNear));
      d.nearText.setAttribute('fill', d.stale ? pal.textMuted : pal.text);
    };

    const drawSql = (v: WindowFunctionTableView) => {
      sqlLayer.textContent = '';
      const cut = v.clause.indexOf(' AND ');
      const clauseLines = cut < 0 ? [v.clause + v.windowSql.close] : [v.clause.slice(0, cut), v.clause.slice(cut + 1) + v.windowSql.close];
      const indent = '         ';
      const lines: { text: string; frame: boolean }[] = [
        ...v.windowSql.head.map((text) => ({ text, frame: false })),
        ...clauseLines.map((text) => ({ text: indent + text, frame: true })),
        ...v.windowSql.tail.map((text) => ({ text, frame: false })),
      ];
      lines.forEach((ln, i) => {
        const y = SQL_TOP + i * lineH;
        if (ln.frame) {
          el(
            'rect',
            {
              x: SQL_X + indent.length * charW - 4,
              y: y - lineH + 5,
              width: (ln.text.length - indent.length) * charW + 8,
              height: lineH,
              fill: pal.bgSubtle,
              stroke: pal.accent,
              rx: 3,
            },
            sqlLayer,
          );
        }
        const txt = el(
          'text',
          { x: SQL_X, y, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: ln.frame ? pal.text : pal.textMuted },
          sqlLayer,
        );
        txt.setAttribute('xml:space', 'preserve');
        txt.textContent = ln.text;
      });
      v.groupSql.forEach((text, i) => {
        const txt = el(
          'text',
          { x: GROUP_X, y: SQL_TOP + i * lineH, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: pal.textMuted },
          sqlLayer,
        );
        txt.textContent = text;
      });
    };

    const drawHead = (v: WindowFunctionTableView) => {
      headLayer.textContent = '';
      const title = (x: number, text: string) => {
        const n = el(
          'text',
          { x, y: TITLE_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: pal.text },
          headLayer,
        );
        n.textContent = text;
      };
      title(COL_ID, t('label.windowResult', 'Window result — rows kept'));
      title(GROUP_X, t('label.groupResult', 'GROUP BY result — rows folded'));
      const [cId, cTeam, cKm] = v.columns;
      if (cId === undefined || cTeam === undefined || cKm === undefined) throw new Error('window-function-stage: 열 이름이 셋이 아니다');
      const head = (x: number, text: string, font: string) => {
        const n = el('text', { x, y: HEAD_Y, 'font-family': font, 'font-size': fontSizes.xs, fill: pal.textMuted }, headLayer);
        n.textContent = text;
      };
      head(COL_ID + 4, cId, fonts.mono);
      head(COL_TEAM + 4, cTeam, fonts.mono);
      head(COL_KM + 4, cKm, fonts.mono);
      head(LANES_X, t('label.frame', 'frame'), fonts.body);
      head(COL_NEAR + 4, v.alias, fonts.mono);
      head(G_TEAM + 4, cTeam, fonts.mono);
      head(G_TOTAL + 4, v.groupAlias, fonts.mono);
      el('line', { x1: COL_ID, x2: COL_NEAR + NEAR_W, y1: HEAD_Y + 6, y2: HEAD_Y + 6, stroke: pal.border }, headLayer);
      el('line', { x1: G_TEAM, x2: G_TEAM + G_W, y1: HEAD_Y + 6, y2: HEAD_Y + 6, stroke: pal.border }, headLayer);
    };

    const buildRows = (v: WindowFunctionTableView) => {
      rowLayer.textContent = '';
      draws = v.rows.map((r, i) => {
        const g = el('g', {}, rowLayer);
        el('rect', { x: COL_ID, y: 1, width: COL_NEAR + NEAR_W - COL_ID, height: RH - 2, fill: pal.bgSubtle, rx: 3 }, g);
        const cell = (x: number, text: string) => {
          const n = el(
            'text',
            { x, y: RH / 2 + 4, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: pal.text },
            g,
          );
          n.textContent = text;
          return n;
        };
        cell(COL_ID + 4, String(r.id));
        cell(COL_TEAM + 4, r.team);
        cell(COL_KM + 4, String(r.km));
        const nearBox = el(
          'rect',
          { x: COL_NEAR, y: 2, width: NEAR_W, height: RH - 4, fill: pal.bg, stroke: pal.border, rx: 3 },
          g,
        );
        const nearText = cell(COL_NEAR + 8, '');
        const bracket = el('path', { d: '', fill: 'none', 'stroke-width': 2 }, rowLayer);
        const d: RowDraw = {
          g,
          y: 0,
          nearText,
          nearBox,
          near: null,
          shownNear: null,
          stale: false,
          bracket,
          top: null,
          bottom: null,
          lane: 0,
        };
        setRowY(d, ROW0 + i * RH);
        return d;
      });
    };

    const clearGroups = (durMs: number) => {
      const old = groups;
      groups = [];
      if (old.length === 0) return;
      tween(
        'groups-out',
        durMs,
        (u) => {
          for (const gd of old) {
            gd.box.setAttribute('width', String(G_W * (1 - u)));
            gd.teamText.setAttribute('opacity', String(1 - u));
            gd.totalText.setAttribute('opacity', String(1 - u));
          }
        },
        () => {
          for (const gd of old) gd.g.remove();
        },
      );
    };

    const clearLinks = (durMs: number) => {
      const old = [...links.values()];
      links = new Map();
      for (const d of draws) d.nearBox.setAttribute('fill', pal.bg);
      if (old.length === 0) return;
      tween(
        'links-out',
        durMs,
        (u) => {
          for (const p of old) p.setAttribute('stroke-dashoffset', String(u));
        },
        () => {
          for (const p of old) p.remove();
        },
      );
    };

    const inst: WindowFunctionStage & ViewInstance = {
      showTable(v, durMs) {
        const key = v.rows.map((r) => `${r.id}:${r.team}:${r.km}`).join(',');
        const fresh = key !== clauseKey;
        drawSql(v);
        if (fresh) {
          clauseKey = key;
          rows = v.rows;
          slots = null;
          parts = [];
          drawHead(v);
          buildRows(v);
          clearGroups(0);
          clearLinks(0);
          return;
        }
        // 앞 판이 남아 있다 — 괄호 · near 는 옛것이 되어 흐려지고, 접힌 쪽과 이음선은 물러난다
        for (let i = 0; i < draws.length; i += 1) {
          draws[i].stale = true;
          drawBracket(i);
          drawNear(draws[i]);
        }
        clearGroups(durMs);
        clearLinks(durMs);
      },

      gather(v, durMs) {
        if (v.slots.length !== rows.length) throw new Error('window-function-stage: 자리 수가 줄 수와 다르다');
        const already = slots !== null;
        slots = v.slots.map((s) => ({ part: s.part, pos: s.pos }));
        parts = v.parts;
        teamColors = categorical(parts.length, 'vivid');
        laneW = LANES_W / Math.max(1, v.widest);
        v.slots.forEach((s) => {
          draws[s.row].lane = s.pos;
        });
        if (already) return;
        const from = draws.map((d) => d.y);
        const to = draws.map((_d, i) => rowTop(i));
        tween('gather', durMs, (u) => {
          draws.forEach((d, i) => {
            setRowY(d, lerp(from[i], to[i], u));
            drawBracket(i);
          });
        });
      },

      showFrames(v, durMs) {
        if (!slots) throw new Error('window-function-stage: 모여 서기 전에 틀이 왔다');
        const moves = v.rows.map((f) => {
          const d = draws[f.row];
          if (d === undefined || draws[f.lo] === undefined || draws[f.hi] === undefined) {
            throw new Error('window-function-stage: 없는 줄의 틀');
          }
          const mid = d.y + RH / 2;
          // 처음 그리는 괄호는 제 줄 가운데에서 벌어지고, 처음 쓰는 near 는 0 에서 굴러 오른다
          const top0 = d.top === null ? mid : d.top;
          const bottom0 = d.bottom === null ? mid : d.bottom;
          d.stale = false;
          d.near = f.near;
          return {
            d,
            row: f.row,
            top0,
            bottom0,
            top1: rowTop(f.lo) + 4,
            bottom1: rowTop(f.hi) + RH - 4,
            near0: d.shownNear === null ? 0 : d.shownNear,
            near1: f.near,
          };
        });
        tween(`frames-${v.part}`, durMs, (u) => {
          for (const m of moves) {
            m.d.top = lerp(m.top0, m.top1, u);
            m.d.bottom = lerp(m.bottom0, m.bottom1, u);
            m.d.shownNear = lerp(m.near0, m.near1, u);
            drawBracket(m.row);
            drawNear(m.d);
          }
        });
      },

      fold(v, durMs) {
        if (!slots) throw new Error('window-function-stage: 모여 서기 전에 접힘이 왔다');
        for (const gd of groups) gd.g.remove();
        groups = v.groups.map((gr, p) => {
          if (gr.rows.length === 0) throw new Error('window-function-stage: 빈 묶음');
          const tops = gr.rows.map((r) => rowTop(r));
          const y = (Math.min(...tops) + Math.max(...tops) + RH) / 2 - RH / 2;
          const g = el('g', { transform: `translate(0 ${y})` }, groupLayer);
          const color = colorOf(p);
          const box = el('rect', { x: G_TEAM, y: 1, width: 0, height: RH - 2, fill: pal.bgSubtle, stroke: color, rx: 3 }, g);
          const teamText = el(
            'text',
            { x: G_TEAM + 4, y: RH / 2 + 4, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: pal.text },
            g,
          );
          teamText.textContent = gr.team;
          const totalText = el(
            'text',
            { x: G_TOTAL + 4, y: RH / 2 + 4, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: pal.text },
            g,
          );
          totalText.textContent = '';
          return { g, box, teamText, totalText, total: gr.total, shown: 0, y };
        });
        // km 가 제 묶음 줄로 날아가 겹친다 — 여럿이 한 줄로 접힌다
        ghostLayer.textContent = '';
        const flights: { node: SVGTextElement; x0: number; y0: number; x1: number; y1: number }[] = [];
        v.groups.forEach((gr, p) => {
          const gd = groups[p];
          for (const r of gr.rows) {
            const node = el(
              'text',
              { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colorOf(p) },
              ghostLayer,
            );
            node.textContent = String(rows[r].km);
            flights.push({ node, x0: COL_KM + 4, y0: draws[r].y + RH / 2 + 4, x1: G_TOTAL + 4, y1: gd.y + RH / 2 + 4 });
          }
        });
        tween(
          'fold',
          durMs,
          (u) => {
            for (const f of flights) {
              f.node.setAttribute('x', String(lerp(f.x0, f.x1, u)));
              f.node.setAttribute('y', String(lerp(f.y0, f.y1, u)));
              f.node.setAttribute('opacity', String(1 - u * u));
            }
            for (const gd of groups) {
              gd.box.setAttribute('width', String(G_W * u));
              gd.shown = gd.total * u;
              gd.totalText.textContent = String(Math.round(gd.shown));
            }
          },
          () => {
            ghostLayer.textContent = '';
          },
        );
      },

      link(v, durMs) {
        if (groups.length === 0) throw new Error('window-function-stage: 접히기 전에 이음이 왔다');
        for (const p of links.values()) p.remove();
        links = new Map();
        const grown: SVGPathElement[] = [];
        for (const l of v.links) {
          const d = draws[l.row];
          const gd = groups[l.part];
          if (d === undefined || gd === undefined) throw new Error('window-function-stage: 없는 줄의 이음');
          const x0 = COL_NEAR + NEAR_W + 2;
          const y0 = d.y + RH / 2;
          const x1 = G_TEAM - 2;
          const y1 = gd.y + RH / 2;
          const mx = (x0 + x1) / 2;
          const path = el(
            'path',
            {
              d: `M ${x0} ${y0} C ${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`,
              fill: 'none',
              stroke: colorOf(l.part),
              'stroke-width': 1.5,
              pathLength: 1,
              'stroke-dasharray': 1,
              'stroke-dashoffset': 1,
            },
            linkLayer,
          );
          d.nearBox.setAttribute('fill', pal.accent);
          links.set(l.row, path);
          grown.push(path);
        }
        tween('links-in', durMs, (u) => {
          for (const p of grown) p.setAttribute('stroke-dashoffset', String(1 - u));
        });
      },

      setCaption(text) {
        caption.textContent = text;
      },

      clear() {
        for (const id of frames.values()) if (hasRaf) cancelAnimationFrame(id);
        frames.clear();
        clauseKey = '';
        rows = [];
        draws = [];
        slots = null;
        parts = [];
        groups = [];
        links = new Map();
        sqlLayer.textContent = '';
        headLayer.textContent = '';
        linkLayer.textContent = '';
        rowLayer.textContent = '';
        groupLayer.textContent = '';
        ghostLayer.textContent = '';
        caption.textContent = '';
      },

      destroy() {
        for (const id of frames.values()) if (hasRaf) cancelAnimationFrame(id);
        frames.clear();
        root.remove();
      },
    };
    // 걸음 0 이 빈 화면이 되지 않게 — 선언의 자료(표 · 질의 · 첫 틀 절)가 있으면 마운트에서 그린다.
    // 자료가 없는 마운트(전수 검사의 `config: {}`)에서는 아무것도 그리지 않는다
    const first = readInitial(params.initialData);
    if (first) inst.showTable(first, 0);
    return inst;
  },
};

/** 선언의 initialData 에서 첫 판의 표 모습을 읽는다. 모양이 다르면 그리지 않는다 (셈이 아니라 보이기라서) */
function readInitial(x: unknown): WindowFunctionTableView | null {
  if (typeof x !== 'object' || x === null) return null;
  const d = x as Record<string, unknown>;
  const isStrs = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
  const sql = d.windowSql;
  if (typeof sql !== 'object' || sql === null) return null;
  const w = sql as Record<string, unknown>;
  const frame = d.frame;
  const clauses = d.frameClauses;
  if (typeof frame !== 'number' || !isStrs(clauses) || typeof clauses[frame] !== 'string') return null;
  if (!isStrs(w.head) || typeof w.close !== 'string' || !isStrs(w.tail)) return null;
  if (!isStrs(d.columns) || !isStrs(d.groupSql) || typeof d.alias !== 'string' || typeof d.groupAlias !== 'string') return null;
  if (!Array.isArray(d.rows)) return null;
  const rows: WindowFunctionStageRow[] = [];
  for (const r of d.rows) {
    if (typeof r !== 'object' || r === null) return null;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'number' || typeof o.team !== 'string' || typeof o.km !== 'number') return null;
    rows.push({ id: o.id, team: o.team, km: o.km });
  }
  return {
    clause: clauses[frame],
    rows,
    columns: d.columns,
    alias: d.alias,
    groupAlias: d.groupAlias,
    windowSql: { head: w.head, close: w.close, tail: w.tail },
    groupSql: d.groupSql,
  };
}
