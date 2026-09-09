/**
 * facet 전수 목록 — 손으로 적지 않고 디렉터리에서 모은다.
 *
 * 회귀 다섯(`register-names` · `facet-first-step` · `canvas-height` ·
 * `canvas-attach` · `piece-first-advance`)이 각자 같은 목록을 들고 있었다.
 * 합쳐 566줄이고, 새 facet 하나마다 다섯 곳에 한 줄씩 보태야 했다.
 *
 * 그 구조가 실제로 구멍을 냈다 — 알고리즘 완제품 열하나를 만들고 `code-panel-phase`
 * 목록에 넣는 것을 빠뜨렸다. **전수 검사가 목록의 성실함에 기대고 있으면 그것은
 * 전수가 아니다.** 빠뜨린 facet 은 통과한 것처럼 보이지 셈에서 빠졌다고 보이지
 * 않는다.
 *
 * `import.meta.glob` 은 vite 가 빌드 시각에 펴 주는 것이라 vitest 안에서만 돈다.
 * 이 파일이 테스트 곁에 있고 `src` 에서 참조되지 않는 이유다.
 */

/**
 * `import.meta.glob` 은 vite 가 넣어 주는 것이라 tsc 의 `ImportMeta` 에 없다.
 * `vite/client` 를 참조하면 core 의 `types: ["node"]` 를 흔들게 되므로 필요한
 * 한 메서드만 여기서 붙인다.
 *
 * 변수에 담아 부르면 안 된다 — vite 는 `import.import.meta.glob(` 이라는 **모양**을
 * 소스에서 찾아 빌드 시각에 펴는 것이라, `const g = import.meta.glob` 처럼
 * 한 번 거치면 변환되지 않고 런타임에 "is not a function" 이 난다.
 */
declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<Record<string, unknown>>>;
    glob(
      pattern: string,
      options: { query: '?raw'; import: 'default'; eager: true },
    ): Record<string, string>;
  }
}

export type FacetModuleRow = [path: string, load: () => Promise<Record<string, unknown>>];

function rows(g: Record<string, () => Promise<Record<string, unknown>>>): FacetModuleRow[] {
  return Object.keys(g)
    .sort()
    .map((key): FacetModuleRow => [key.replace(/^(\.\.\/)+/, ''), g[key]!]);
}

/** facet 패키지의 등록 진입점 전부. */
export const FACET_MODULES: FacetModuleRow[] = rows(import.meta.glob('../../../facets/*/*/src/index.ts'));

/** stage view 파일 전부. stage 를 두지 않은 facet 은 여기 없다. */
export const STAGE_MODULES: FacetModuleRow[] = rows(
  import.meta.glob('../../../facets/*/*/src/*-stage.ts'),
);

/**
 * `@piece` 표식을 단 facet 의 수.
 *
 * `piece-first-advance` 는 컨트롤 모양(다시 보기 + 한 걸음)으로 조각을 가린다 —
 * 런타임에 JSDoc 이 남지 않으므로 그 방법밖에 없다. 그런데 그러면 **컨트롤을
 * 잘못 단 조각이 검사에서 스스로를 지운다.** 잡아야 할 결함이 대상에서 빠져
 * 나가는 모양이라, 검사가 조용히 통과한다.
 *
 * 그래서 소스에서 표식을 세어 둔다. 두 수가 어긋나면 컨트롤이 규범을 벗어난
 * 조각이 있다는 뜻이다.
 */
export const PIECE_MARKED_COUNT: number = Object.values(
  import.meta.glob('../../../facets/*/*/src/facet.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
).filter((src) => src.includes('@piece')).length;

/**
 * facet 패키지의 소스 전문. 경로 → 내용.
 *
 * 코드가 **무엇이라 적혀 있는지**를 보는 검사용이다. 모듈을 로드해서는 알 수 없는
 * 것 — 호출부에 리터럴로 적힌 en 원본이 선언과 같은지 — 이 여기서만 드러난다.
 */
export const FACET_SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../../facets/*/*/src/*.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([key, src]) => [key.replace(/^(\.\.\/)+/, ''), src]),
);
