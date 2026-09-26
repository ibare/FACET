## 짝이 없는 줄은 어디로 가는가

두 표를 잇는 조인은 조건에 맞는 짝을 찾아 두 줄을 한 줄로 붙인다. 그런데 왼쪽 표의 줄
가운데 오른쪽 표에 짝이 하나도 없는 줄은 어떻게 될까. `INNER JOIN` 은 그런 줄을 결과에서
뺀다. `LEFT JOIN` 은 뺄 뻔한 그 줄을 **결과에 남기고**, 채울 값이 없는 오른쪽 칸을 `NULL` 로
채운다.

{facet:keepUnmatched}

### 걸음 넷

손님 다섯(`customer`)과 주문 셋(`orders`)이 있고, 질의는 이렇다.

```sql
SELECT c.name, o.item
FROM customer c
LEFT JOIN orders o ON o.cust_id = c.id;
```

0. **처음 모습.** 두 표(`customer` 5 줄 · `orders` 3 줄)와 위의 SQL 이 놓인다.
1. **짝이 맞는 줄이 이어진다.** Ann–book · Cy–lamp · Eve–cup, 결과 3 줄. 여기까지는
   `INNER JOIN` 과 똑같고, `INNER JOIN` 이라면 여기서 끝난다.
2. **짝이 없는 줄이 드러난다.** Bo 와 Di 는 `orders` 에 짝이 없다. 이 두 줄이 표에서
   떨어져 나간다.
3. **그 줄이 되돌아와 `NULL` 을 단다.** `LEFT JOIN` 은 왼쪽 줄을 하나도 버리지 않는다.
   Bo 와 Di 는 결과로 돌아오고, `item` 칸은 `NULL` 로 채워진다. 결과는 5 줄이다.

`INNER JOIN` 의 3 줄과 `LEFT JOIN` 의 5 줄의 차이 2 가 곧 짝 없는 왼쪽 줄의 수다.

### `NULL` 은 빈칸이 아니다

`NULL` 은 "여기 들어갈 값이 없다" 는 표시다. 빈 글자나 `0` 과 다르다 — Bo 의 `item` 은
빈 이름의 물건이 아니라, 붙일 주문 자체가 없다는 뜻이다. 그래서 `LEFT JOIN` 결과에서
`WHERE o.item IS NULL` 로 거르면 "주문이 없는 손님" 만 골라낼 수 있다.

### 여기서 정해 둔 것

- 이 예의 손님은 주문이 많아야 하나다. 한 손님에게 주문이 여럿이면 그 손님의 줄이 주문
  수만큼 되풀이된다 — 그것은 짝을 찾아 복사하는 조인 자체의 이야기라 여기서는 다루지 않는다.
- 오른쪽 표에만 있는 줄(짝 없는 주문)을 남기는 `RIGHT JOIN` · `FULL JOIN` 도 다루지 않는다.
- `ORDER BY` 가 없으면 결과의 줄 차례는 약속되지 않는다 — 여기서는 원래 표(`customer`)의
  차례로 보였다.
