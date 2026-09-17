/**
 * coarseThenFine 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 의 `let` 0 · stage 의 `let` 0 (DOM 손잡이조차 `const` 였다) · 조회로
 * 갈리는 분기 0. **곧 화면이 통째로 상태였다는 뜻이다.** 옮길 것은 전부 타입 선언과
 * SVG 속성에 있었다.
 *
 * - `type LayerView = { root, trails, spokes, dots }` — 층 하나가 아는 것 넷이 한
 *   객체에 묶여 있었다.
 *   - `root` 의 `opacity` — "이 층은 지금 견줌에 쓰이지 않는다". `flat` 걸음에서만
 *     0.3 으로 내려갔고 되돌리는 것은 `reset` 뿐이었다.
 *   - `trails` 의 자식 — **그 층에서 걸어온 자취.** 어디서 어디로 옮겼는지가 선
 *     요소로만 남아 있었다.
 *   - `spokes` 의 자식 — 지금 자리에서 견준 이웃들. 걸음이 끝나면 `clearSpokes` 가
 *     지웠다.
 *   - `dots: Map<string, SVGCircleElement>` — 값만이 아니라 **"이 층에 이 점이
 *     있느냐"** 와 **넣은 차례**가 함께 실린 자리다. 게다가 한 점의 `fill`·`stroke`·`r`
 *     셋에 **"이 점의 거리를 쟀나"** 가 실려 있었다 (`markSeen` ↔ `markIdle`).
 * - `walker` 와 `walkerTag` — **재건 밖 요소.** `cx`·`cy`·`r`·`text-anchor`·
 *   `textContent` 가 "지금 어디에 서 있나 · 그 자리의 이름이 무엇인가" 를 쥐었는데
 *   `reset` 은 `opacity` 만 되돌렸다. 되감은 직후 좌표가 앞 회차의 것으로 남았다.
 * - `dropG` · `markG` 의 자식 — 층에서 층으로 물려준 점선, 그리고 답의 고리.
 * - `captionLine1/2` 의 `textContent` — 지금 무엇을 말하고 있나.
 *
 * ── 본 점 수에 답이 둘이었다 (함정 25 · 34)
 *
 * 화면에 켜진 점은 발신의 `fresh` 목록이 정했고, 캡션의 "본 점 {n}" 은 발신의
 * `seen` **수**가 정했다. 같은 물음에 출처가 둘이라 둘이 어긋나도 아무도 모른다.
 * 지금은 `measuredAt` 하나가 두 답을 다 낸다 — 켜지는 점도, 캡션의 수도, 마지막
 * 견줌의 "여덟 대 열다섯" 도 전부 그 함수를 지난다. 그래서 **화면을 세어 캡션을
 * 반증할 수 있다.**
 *
 * ── 어떤 수를 싣고 어떤 수를 셈하나 (프로토콜 4 절)
 *
 * | 무엇 | 어디서 |
 * | --- | --- |
 * | 몇 번째 층인가 · 지금 어느 자리인가 · 본 점이 몇인가 · 점이 모두 몇인가 | **장면이 센다** |
 * | 어느 점이 이 층의 이웃인가 · 그 가운데 어디로 옮기는가 · 한 층만 쓰면 어디를 거치는가 | **걸음이 싣는 판정** |
 *
 * 층 안에서 이웃을 재어 더 가까운 쪽을 고르는 셈은 **이 조각의 알고리즘 그 자체**라
 * 내주지 않는다 (`neighborsOf` · `flatSearch` 는 algorithm 에 남는다). 장면은 그
 * 판정을 받아 적을 뿐이고, 판정에서 **파생되는 수**는 전부 스스로 센다.
 *
 * 반대로 **몇 번째 층인가**는 싣지 않는다 — 층은 `hand-down` 이 올 때마다 한 칸씩
 * 내려가므로 지나온 `hand-down` 의 수가 곧 지금 층이다. `fresh` 도 싣지 않는다 —
 * 이미 잰 점이 무엇인지는 자취가 안다.
 *
 * 좌표는 담지 않는다. 점의 **자료 좌표**와 층별 구성원이라는 구조만 담고 화면 자리는
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 —
 * 무엇을 말할지만 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 자료 좌표의 점 하나. 값이지 화면 자리가 아니다. */
export type CoarsePoint = { id: string; x: number; y: number };

/** 한 층. 위층일수록 구성원이 적다 — 그 성김이 이 조각의 주장이다. */
export type CoarseLayer = { id: string; members: readonly string[] };

/**
 * 한 자리에 서서 이웃을 견준 것 하나.
 *
 * 이웃이 누구인지(`cands`)와 어디로 옮기는지(`to`)는 거리를 재는 셈이라 걸음이
 * 싣는 판정이다. 몇 번째 층인지(`layer`)와 어디에 서 있었는지(`at`)는 자취가
 * 정하므로 `reduce` 가 센다.
 */
export type CoarseProbe = {
  /** 몇 번째 층인가. 0 이 가장 성긴 위층이다. */
  layer: number;
  /** 어느 자리에서 보았나. */
  at: string;
  /** 그 자리에서 거리를 잰 이웃들. */
  cands: readonly string[];
  /** 이 견줌의 결말 — 옮겼나 · 물려주었나 · 멈췄나. */
  outcome: 'hop' | 'hand-down' | 'stop';
  /** 옮겨 간 자리. `outcome` 이 `hop` 일 때만 있다. */
  to: string | null;
};

/**
 * 한 층만 쓰는 견줌의 결과.
 *
 * 같은 진입점에서 맨 아래층 한 장만으로 걸으면 어디를 거쳐(`path`) 무엇을
 * 재는가(`seen`). 이것도 걸음이 내리는 판정이라 싣는다 — 장면이 다시 풀면 조각이
 * 피하려는 셈을 장면이 하게 된다.
 */
export type CoarseFlat = {
  path: readonly string[];
  seen: readonly string[];
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 걷는 이가 어디서 출발하는지도 자취 한 칸을 물려
 * 셈하므로 `prev` 를 들출 일이 없다 (S-scene).
 */
export type CoarseStep =
  /** 가장 성긴 층의 진입점에 선다. */
  | { kind: 'enter' }
  /** 이웃을 보고 더 가까운 쪽으로 옮긴다. */
  | { kind: 'hop' }
  /** 이 층에는 더 가까운 이웃이 없다 — 자리를 아래층에 물려준다. */
  | { kind: 'handDown' }
  /** 맨 아래층에서도 더 나은 이웃이 없다. */
  | { kind: 'stop' }
  /** 답이 난다. */
  | { kind: 'found' }
  /** 한 층만 쓰는 견줌이 같은 판 위에 겹쳐 선다. */
  | { kind: 'flat' };

export type CoarseThenFineScene = {
  // ── 바탕. `initial` 이 값을 베껴 한 번 정하고 걸음이 고치지 않는다.
  /** 점들의 자료 좌표. */
  points: readonly CoarsePoint[];
  /** 찾는 자리. 층마다 같은 평면이므로 판마다 같은 자리에 선다. */
  query: { x: number; y: number };
  /** 위층부터 아래층 순서. 마지막이 전부를 담은 바닥 층이다. */
  layers: readonly CoarseLayer[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 가장 성긴 층의 진입점. 아직 안 섰으면 `null`. */
  entry: string | null;
  /** 층을 내려오며 한 견줌들, 한 차례대로. */
  probes: readonly CoarseProbe[];
  /** 답이 났나. 그 자리가 어디인지는 자취가 말한다. */
  found: boolean;
  /** 한 층만 쓰는 견줌. 아직 안 했으면 `null`. */
  flat: CoarseFlat | null;

  step: CoarseStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `entry` 부터 `flat` 까지는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이
 * 이미 다 걸어간 채로 서고 그 위에 algorithm 이 처음부터 다시 세우는 것이 겹친다
 * (S-scene).
 */
type Base = Pick<CoarseThenFineScene, 'points' | 'query' | 'layers'>;

/**
 * 되돌린 뒤의 장면 — 판과 점과 십자만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): CoarseThenFineScene {
  return {
    points: base.points,
    query: base.query,
    layers: base.layers,
    entry: null,
    probes: [],
    found: false,
    flat: null,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 문자열 목록. 그 밖의 알맹이는 버린다. */
function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

// ── 장면에서 셈해지는 것들 ──────────────────────────────────────────────────
//
// 화면에 뜨는 수와 표식은 전부 여기를 지난다. 켜지는 점도, 캡션의 "본 점" 도 같은
// 함수를 부르므로 갈릴 자리가 없다.

/** 지금 몇 번째 층에 서 있나. `hand-down` 이 올 때마다 한 칸씩 내려간다. */
export function layerCursorOf(scene: CoarseThenFineScene): number {
  const floor = Math.max(0, scene.layers.length - 1);
  let at = 0;
  for (const probe of scene.probes) {
    if (probe.outcome === 'hand-down') at += 1;
  }
  return Math.min(floor, at);
}

/**
 * 층을 내려오며 걸어 온 끝자리 — 진입점에서 옮긴 마지막 자리.
 *
 * 한 층만 쓰는 견줌으로 넘어가도 이 자리는 그대로다. 그 견줌이 **어디서 출발하는지**
 * 도 여기서 나오므로 화면을 되읽을 일이 없다 (함정 28).
 */
export function layeredNodeOf(scene: CoarseThenFineScene): string | null {
  for (let i = scene.probes.length - 1; i >= 0; i -= 1) {
    const probe = scene.probes[i];
    if (probe !== undefined && probe.outcome === 'hop' && probe.to !== null) return probe.to;
  }
  return scene.entry;
}

/** 지금 걷는 이가 서 있는 점. 아직 안 섰으면 `null`. */
export function walkerNodeOf(scene: CoarseThenFineScene): string | null {
  if (scene.flat !== null) {
    return scene.flat.path[scene.flat.path.length - 1] ?? scene.entry;
  }
  return layeredNodeOf(scene);
}

/** 걷는 이가 선 판. 한 층만 쓰는 견줌으로 넘어가면 맨 아래 판이다. */
export function walkerLayerOf(scene: CoarseThenFineScene): number {
  if (scene.flat !== null) return Math.max(0, scene.layers.length - 1);
  return layerCursorOf(scene);
}

/**
 * 점마다 **처음 거리를 잰 층.** 아직 안 잰 점은 없다.
 *
 * 한 점은 처음 잰 층에서만 켜진다 — 물려받은 자리를 다시 재지는 않으므로 표시도
 * 늘지 않고, 그것이 층을 쌓아 아끼는 바로 그 몫이다. 그래서 **화면에 켜진 점의 수가
 * 곧 본 점의 수**이고 둘이 어긋날 자리가 없다.
 */
export function measuredAt(scene: CoarseThenFineScene): Map<string, number> {
  const out = new Map<string, number>();
  if (scene.entry !== null) out.set(scene.entry, 0);
  for (const probe of scene.probes) {
    for (const id of probe.cands) {
      if (!out.has(id)) out.set(id, probe.layer);
    }
  }
  return out;
}

/** 층을 내려오며 거리를 잰 점의 수. 캡션의 "본 점" 이 이 수다. */
export function measuredCountOf(scene: CoarseThenFineScene): number {
  return measuredAt(scene).size;
}

/**
 * 이번 걸음에 **처음** 거리를 잰 점들.
 *
 * 그 걸음에 새로 켜지는 점이라 운동이 여기서 나온다. 발신이 `fresh` 를 싣지 않아도
 * 되는 까닭이다 — 이미 잰 점이 무엇인지는 자취가 안다.
 */
export function freshlyMeasuredOf(scene: CoarseThenFineScene): string[] {
  const last = scene.probes.length - 1;
  if (last < 0) return scene.entry === null ? [] : [scene.entry];

  const before = new Set<string>();
  if (scene.entry !== null) before.add(scene.entry);
  for (let i = 0; i < last; i += 1) {
    for (const id of scene.probes[i]?.cands ?? []) before.add(id);
  }

  const out: string[] = [];
  for (const id of scene.probes[last]?.cands ?? []) {
    if (before.has(id)) continue;
    before.add(id);
    out.push(id);
  }
  return out;
}

/** 지금 자리에서 견주고 있는 이웃들. 마지막 견줌 하나만 화면에 선다. */
export function lastProbeOf(scene: CoarseThenFineScene): CoarseProbe | null {
  return scene.probes[scene.probes.length - 1] ?? null;
}

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다 (C10). */
export type CoarseCaption =
  | { kind: 'enter'; node: string }
  | { kind: 'hop'; from: string; to: string }
  | { kind: 'handDown'; layer: string; n: number }
  | { kind: 'stop'; n: number }
  | { kind: 'found'; node: string; n: number; total: number }
  | { kind: 'flat'; node: string; n: number; total: number };

/**
 * 지금 화면이 말할 것.
 *
 * 걸음이 아니라 **자취**에서 나온다 — 정적 그리기가 `step` 을 읽지 않아야 흘려
 * 세운 화면과 곧바로 세운 화면이 같아진다 (S-scene).
 */
export function captionOf(scene: CoarseThenFineScene): CoarseCaption | null {
  const total = scene.points.length;

  if (scene.flat !== null) {
    return {
      kind: 'flat',
      node: scene.flat.path[scene.flat.path.length - 1] ?? '',
      n: scene.flat.seen.length,
      total,
    };
  }
  if (scene.found) {
    return {
      kind: 'found',
      node: walkerNodeOf(scene) ?? '',
      n: measuredCountOf(scene),
      total,
    };
  }

  const probe = lastProbeOf(scene);
  if (probe !== null) {
    switch (probe.outcome) {
      case 'hop':
        return { kind: 'hop', from: probe.at, to: probe.to ?? '' };
      case 'hand-down':
        return {
          kind: 'handDown',
          layer: scene.layers[probe.layer + 1]?.id ?? '',
          n: measuredCountOf(scene),
        };
      case 'stop':
        return { kind: 'stop', n: measuredCountOf(scene) };
    }
  }

  if (scene.entry !== null) return { kind: 'enter', node: scene.entry };
  return null;
}

export const coarseThenFineScene: ScenePlan<CoarseThenFineScene> = {
  /**
   * 첫 장면은 판과 점만 세우고 비어 있다.
   *
   * 이 조각은 `init` 을 발신하지 않으므로 바탕을 여기서 좁힌다. **넘겨받은 것을
   * 참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는 한
   * 객체라, 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   */
  initial(initialData: unknown): CoarseThenFineScene {
    const d = fields(initialData) ?? {};

    const points: CoarsePoint[] = [];
    if (Array.isArray(d.points)) {
      for (const raw of d.points) {
        const p = fields(raw);
        if (p === null) continue;
        const x = num(p.x);
        const y = num(p.y);
        if (typeof p.id !== 'string' || x === null || y === null) continue;
        points.push({ id: p.id, x, y });
      }
    }

    const layers: CoarseLayer[] = [];
    if (Array.isArray(d.layers)) {
      for (const raw of d.layers) {
        const l = fields(raw);
        if (l === null || typeof l.id !== 'string') continue;
        layers.push({ id: l.id, members: names(l.members) });
      }
    }

    const q = fields(d.query);
    return atStart({
      points,
      layers,
      query: { x: num(q?.x) ?? 0, y: num(q?.y) ?? 0 },
    });
  },

  reduce(scene: CoarseThenFineScene, event: FacetRuntimeEvent): CoarseThenFineScene {
    const p = fields(event.payload);

    /** 지금 자리에서 이웃을 견준 것 하나를 자취에 얹는다. */
    const probed = (
      outcome: CoarseProbe['outcome'],
      to: string | null,
      step: CoarseStep,
    ): CoarseThenFineScene => {
      const at = layeredNodeOf(scene);
      if (at === null) return scene;
      const probe: CoarseProbe = {
        layer: layerCursorOf(scene),
        at,
        cands: names(p?.cands),
        outcome,
        to,
      };
      return { ...scene, probes: [...scene.probes, probe], step };
    };

    switch (event.type) {
      /* 가장 성긴 층의 진입점에 선다. 어느 점인가는 걸음이 정한다. */
      case 'enter': {
        const node = str(p?.node);
        if (node === '') return scene;
        return { ...scene, entry: node, step: { kind: 'enter' } };
      }

      /* 이웃 가운데 더 가까운 쪽으로 옮긴다. 어디서 떠나는지는 자취가 안다. */
      case 'hop': {
        const to = str(p?.to);
        if (to === '') return scene;
        return probed('hop', to, { kind: 'hop' });
      }

      /* 더 가까운 이웃이 없다 — 자리를 아래층에 물려준다. 몇 층인지는 자취가 센다. */
      case 'hand-down':
        return probed('hand-down', null, { kind: 'handDown' });

      /* 맨 아래층에서도 더 나은 이웃이 없다. 멈추는 조건이다. */
      case 'stop':
        return probed('stop', null, { kind: 'stop' });

      /* 답이 난다. 어느 점인지도 몇을 쟀는지도 자취에 이미 있다. */
      case 'found':
        return { ...scene, found: true, step: { kind: 'found' } };

      /* 한 층만 쓰는 견줌. 거쳐 간 자리와 잰 점은 걸음이 내린 판정이다. */
      case 'flat': {
        const path = names(p?.path);
        if (path.length === 0) return scene;
        return { ...scene, flat: { path, seen: names(p?.seen) }, step: { kind: 'flat' } };
      }

      /* 손으로 짚기 시작 — 바탕만 남기고 자취를 턴다. 객체 리터럴을 넘긴다. */
      case 'rewind':
        return atStart({ points: scene.points, query: scene.query, layers: scene.layers });

      default:
        // 이 algorithm 이 발신하는 것은 위 일곱이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
