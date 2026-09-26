/**
 * policy-gradient 무대 — 왼쪽은 환경이 가진 상의 표, 오른쪽은 행위자 다섯이 가진 확률 막대 셋.
 *
 * 운동: 판마다 막대 셋이 새 π 로 **밀린다** (앞 높이에서 새 높이로, 걸음 길이 안에서). 새 판의 걸음 0 에서는
 * 앞 판의 끝 막대가 처음 π 로 되돌아간다. 가장 큰 π 의 막대만 채움색이 바뀐다 — 가장 좋은 행동이면 accent,
 * 다른 행동이면 danger. 그 판정 · 뽑힌 행동 · G − b 는 모두 payload 로 받는다 (무대는 셈하지 않는다).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type PolicyGradientStartView = {
  actions: string[];
  rewards: number[];
  gains: number[];
  pis: number[][];
  leaders: number[];
  best: number;
  total: number;
  bestLeads: number;
  otherLeads: number;
  durationMs: number;
};

export type PolicyGradientEpisodeView = {
  episode: number;
  total: number;
  best: number;
  pis: number[][];
  chosen: number[];
  advantages: number[];
  leaders: number[];
  bestLeads: number;
  otherLeads: number;
  durationMs: number;
};

export type PolicyGradientFinalView = {
  total: number;
  best: number;
  pis: number[][];
  leaders: number[];
  bestLeads: number;
  otherLeads: number;
  durationMs: number;
};

export type PolicyGradientStage = {
  start(v: PolicyGradientStartView): void;
  episode(v: PolicyGradientEpisodeView): void;
  final(v: PolicyGradientFinalView): void;
  destroy(): void;
};

const W = 760;
const H = 360;
const ENV_X = 12;
const ENV_Y = 44;
const ENV_W = 156;
const AGENTS_X = 188;
const BAR_TOP = 64;
const BAR_BOTTOM = 238;
const BAR_W = 22;
const BAR_GAP = 8;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 표시용 — 둘째 자리, 음수는 빼기 기호, −0.00 은 0.00. */
function fmt(v: number): string {
  const s = v.toFixed(2);
  if (Number(s) === 0) return (0).toFixed(2);
  return s.replace('-', '−');
}

function fmtSigned(v: number): string {
  const s = fmt(v);
  return Number(v.toFixed(2)) > 0 ? `+${s}` : s;
}

function fmtInt(v: number): string {
  return String(v).replace('-', '−');
}

type AgentEls = {
  header: SVGTextElement;
  bars: SVGRectElement[];
  values: SVGTextElement[];
  labels: SVGTextElement[];
  markers: SVGPolygonElement[];
  advantage: SVGTextElement;
  leader: SVGTextElement;
};

export const policyGradientStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container, params): ViewInstance & PolicyGradientStage {
    void container;
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (x: number, y: number, size: string, fill: string, anchor: 'start' | 'middle' | 'end', parent: Element, weight = 'normal'): SVGTextElement =>
      el('text', { x, y, 'font-family': fonts.body, 'font-size': size, fill, 'text-anchor': anchor, 'font-weight': weight }, parent);

    const root = el('g', {}, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, root);

    // 환경 — 행위자가 모르는 상의 표
    const envLayer = el('g', {}, root);
    // 행위자 다섯
    const agentLayer = el('g', {}, root);
    const caption = text(ENV_X, H - 14, fontSizes.md, c.text, 'start', root);

    let actions: string[] = [];
    let agents: AgentEls[] = [];
    let agentCount = 0;
    /** 지금 그려진 막대 높이(π) — 운동의 출발점. */
    let shown: number[][] = [];
    let anim = 0;

    const barX = (agent: number, action: number): number => {
      const colW = (W - AGENTS_X - 8) / agentCount;
      const groupW = actions.length * BAR_W + (actions.length - 1) * BAR_GAP;
      return AGENTS_X + colW * agent + (colW - groupW) / 2 + action * (BAR_W + BAR_GAP);
    };
    const colCenter = (agent: number): number => {
      const colW = (W - AGENTS_X - 8) / agentCount;
      return AGENTS_X + colW * agent + colW / 2;
    };
    const barHeight = (p: number): number => (BAR_BOTTOM - BAR_TOP) * p;

    const place = (heights: number[][]): void => {
      for (let a = 0; a < agents.length; a++) {
        for (let k = 0; k < actions.length; k++) {
          const h = barHeight(heights[a][k]);
          const bar = agents[a].bars[k];
          bar.setAttribute('y', String(BAR_BOTTOM - h));
          bar.setAttribute('height', String(h));
          const val = agents[a].values[k];
          val.setAttribute('y', String(BAR_BOTTOM - h - 4));
        }
      }
    };

    const moveTo = (target: number[][], durationMs: number): void => {
      if (target.length !== agents.length || target.some((row) => row.length !== actions.length)) {
        throw new Error('policy-gradient 무대: π 의 모양이 행위자 · 행동 수와 다르다');
      }
      const from = shown.map((row) => row.slice());
      const token = ++anim;
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
      if (raf === null || durationMs <= 0) {
        shown = target.map((row) => row.slice());
        place(shown);
        return;
      }
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const frame = (now: number): void => {
        if (token !== anim) return;
        const k = Math.min(1, (now - t0) / durationMs);
        const e = 1 - (1 - k) * (1 - k);
        shown = from.map((row, a) => row.map((p, j) => p + (target[a][j] - p) * e));
        place(shown);
        if (k < 1) raf(frame);
        else {
          shown = target.map((row) => row.slice());
          place(shown);
        }
      };
      raf(frame);
    };

    const buildEnv = (rewards: number[], gains: number[]): void => {
      envLayer.replaceChildren();
      const rowH = 26;
      const boxH = 64 + rowH * actions.length;
      el('rect', { x: ENV_X, y: ENV_Y, width: ENV_W, height: boxH, rx: 6, fill: c.bgSubtle, stroke: c.border }, envLayer);
      text(ENV_X + 10, ENV_Y + 22, fontSizes.sm, c.text, 'start', envLayer, '600').textContent = t('label.environment', 'Environment');
      const colA = ENV_X + 18;
      const colR = ENV_X + 82;
      const colG = ENV_X + ENV_W - 16;
      text(colR, ENV_Y + 46, fontSizes.xs, c.textMuted, 'end', envLayer).textContent = t('label.reward', 'reward');
      text(colG, ENV_Y + 46, fontSizes.xs, c.textMuted, 'end', envLayer).textContent = t('label.gain', 'G');
      for (let k = 0; k < actions.length; k++) {
        const y = ENV_Y + 46 + rowH * (k + 1);
        text(colA, y, fontSizes.sm, c.text, 'start', envLayer).textContent = actions[k];
        text(colR, y, fontSizes.sm, c.textMuted, 'end', envLayer).textContent = fmtInt(rewards[k]);
        text(colG, y, fontSizes.sm, c.text, 'end', envLayer, '600').textContent = fmtInt(gains[k]);
      }
    };

    const buildAgents = (count: number): void => {
      agentLayer.replaceChildren();
      agents = [];
      shown = [];
      agentCount = count;
      for (let a = 0; a < count; a++) {
        const g = el('g', {}, agentLayer);
        const header = text(colCenter(a), 34, fontSizes.sm, c.text, 'middle', g, '600');
        header.textContent = t('label.agent', 'Agent {n}', { n: a + 1 });
        const bars: SVGRectElement[] = [];
        const values: SVGTextElement[] = [];
        const labels: SVGTextElement[] = [];
        const markers: SVGPolygonElement[] = [];
        for (let k = 0; k < actions.length; k++) {
          const x = barX(a, k);
          el('rect', { x, y: BAR_TOP, width: BAR_W, height: BAR_BOTTOM - BAR_TOP, fill: c.bgSubtle, stroke: c.border }, g);
          bars.push(el('rect', { x, y: BAR_BOTTOM, width: BAR_W, height: 0, fill: c.textMuted, stroke: c.text, 'stroke-width': 0 }, g));
          const val = text(x + BAR_W / 2, BAR_BOTTOM - 4, fontSizes.xs, c.text, 'middle', g);
          values.push(val);
          const lab = text(x + BAR_W / 2, BAR_BOTTOM + smPx + 4, fontSizes.sm, c.text, 'middle', g);
          lab.textContent = actions[k];
          labels.push(lab);
          const my = BAR_BOTTOM + smPx + 10;
          const mk = el('polygon', { points: `${x + BAR_W / 2},${my} ${x + BAR_W / 2 - 6},${my + 9} ${x + BAR_W / 2 + 6},${my + 9}`, fill: c.text, visibility: 'hidden' }, g);
          markers.push(mk);
        }
        const advantage = text(colCenter(a), BAR_BOTTOM + 56, fontSizes.sm, c.text, 'middle', g);
        const leader = text(colCenter(a), BAR_BOTTOM + 76, fontSizes.sm, c.text, 'middle', g, '600');
        agents.push({ header, bars, values, labels, markers, advantage, leader });
        shown.push(new Array<number>(actions.length).fill(0));
      }
    };

    const paintLeaders = (leaders: number[], best: number): void => {
      if (leaders.length !== agents.length) throw new Error('policy-gradient 무대: 앞선 행동 목록의 길이가 다르다');
      for (let a = 0; a < agents.length; a++) {
        const l = leaders[a];
        for (let k = 0; k < actions.length; k++) {
          const fill = l === k ? (k === best ? c.accent : c.danger) : c.textMuted;
          agents[a].bars[k].setAttribute('fill', fill);
        }
        const lt = agents[a].leader;
        if (l < 0) {
          lt.textContent = '';
        } else {
          lt.textContent = t('label.leads', '{a} leads', { a: symbol(l) });
          lt.setAttribute('fill', l === best ? c.text : c.danger);
        }
      }
    };

    const showValues = (pis: number[][] | null): void => {
      for (let a = 0; a < agents.length; a++) {
        for (let k = 0; k < actions.length; k++) {
          agents[a].values[k].textContent = pis === null ? '' : fmt(pis[a][k]);
        }
      }
    };

    const markChosen = (chosen: number[] | null): void => {
      for (let a = 0; a < agents.length; a++) {
        const ch = chosen === null ? -1 : chosen[a];
        for (let k = 0; k < actions.length; k++) {
          agents[a].markers[k].setAttribute('visibility', ch === k ? 'visible' : 'hidden');
          agents[a].bars[k].setAttribute('stroke-width', ch === k ? '2' : '0');
        }
      }
    };

    const showAdvantages = (adv: number[] | null): void => {
      for (let a = 0; a < agents.length; a++) {
        agents[a].advantage.textContent = adv === null ? '' : t('label.advantage', 'G − b {v}', { v: fmtSigned(adv[a]) });
      }
    };

    const needAgents = (): void => {
      if (agents.length === 0) throw new Error('policy-gradient 무대: 걸음 0 (start) 전에 판이 왔다');
    };
    const symbol = (k: number): string => {
      const sym = actions[k];
      if (sym === undefined) throw new Error(`policy-gradient 무대: 모르는 행동 ${k}`);
      return sym;
    };

    const api: PolicyGradientStage = {
      start(v) {
        const sameShape = v.actions.length === actions.length && v.actions.every((s, i) => s === actions[i]) && v.pis.length === agents.length;
        actions = v.actions.slice();
        if (!sameShape) buildAgents(v.pis.length);
        buildEnv(v.rewards, v.gains);
        paintLeaders(v.leaders, v.best);
        markChosen(null);
        showAdvantages(null);
        showValues(v.pis);
        moveTo(v.pis, v.durationMs);
        caption.textContent = t('caption.start', 'Before episode 1 · starting π {pis}', {
          pis: v.pis[0].map(fmt).join(' / '),
        });
      },
      episode(v) {
        needAgents();
        paintLeaders(v.leaders, v.best);
        markChosen(v.chosen);
        showAdvantages(v.advantages);
        showValues(null);
        moveTo(v.pis, v.durationMs);
        caption.textContent = t('caption.episode', 'Episode {n}/{total} · {best} leads {bestN}/{agents} · another action leads {otherN}/{agents}', {
          n: v.episode,
          total: v.total,
          best: symbol(v.best),
          bestN: v.bestLeads,
          otherN: v.otherLeads,
          agents: agents.length,
        });
      },
      final(v) {
        needAgents();
        paintLeaders(v.leaders, v.best);
        markChosen(null);
        showAdvantages(null);
        showValues(v.pis);
        moveTo(v.pis, v.durationMs);
        caption.textContent = t('caption.final', 'After episode {total} · {best} leads {bestN}/{agents} · another action leads {otherN}/{agents}', {
          total: v.total,
          best: symbol(v.best),
          bestN: v.bestLeads,
          otherN: v.otherLeads,
          agents: agents.length,
        });
      },
      destroy() {
        anim++;
        root.remove();
      },
    };
    return { ...api };
  },
};
