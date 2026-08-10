/**
 * 검색어 파서 — 1.0의 src/lib/search-parser.ts 를 그대로 이식.
 *
 * 지원 문법:  우산*빗물   (AND)   우산+양산   (OR)   "접이식 우산"  (구문)   (a+b)*c
 * 연산자가 없으면 띄어쓰기를 AND로 본다.
 */

export type SearchNode =
  | { type: "AND"; left: SearchNode; right: SearchNode }
  | { type: "OR"; left: SearchNode; right: SearchNode }
  | { type: "TERM"; value: string };

type TokenType = "WORD" | "AND" | "OR" | "LPAREN" | "RPAREN";
type Token = { type: TokenType; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // 큰따옴표로 묶은 구문은 통째로 한 단어
    if (char === '"') {
      i++;
      let value = "";
      while (i < input.length && input[i] !== '"') {
        value += input[i];
        i++;
      }
      i++;
      if (value) tokens.push({ type: "WORD", value });
      continue;
    }

    if (char === "*") {
      tokens.push({ type: "AND", value: "*" });
      i++;
      continue;
    }
    if (char === "+") {
      tokens.push({ type: "OR", value: "+" });
      i++;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
      continue;
    }

    let value = "";
    while (i < input.length && !/[\s*+()]/.test(input[i]) && input[i] !== '"') {
      value += input[i];
      i++;
    }
    if (value) tokens.push({ type: "WORD", value });
  }

  return tokens;
}

class Parser {
  private current = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.current];
  }
  private consume(): Token {
    return this.tokens[this.current++];
  }
  private match(type: TokenType): boolean {
    if (this.tokens[this.current]?.type === type) {
      this.current++;
      return true;
    }
    return false;
  }

  parse(): SearchNode | null {
    try {
      return this.expression();
    } catch {
      return null;
    }
  }

  /** Expression : Term ('+' Term)* */
  private expression(): SearchNode {
    let node = this.term();
    while (this.match("OR")) {
      node = { type: "OR", left: node, right: this.term() };
    }
    return node;
  }

  /** Term : Factor ('*' Factor | Factor)*  — 붙어 있는 단어는 암묵적 AND */
  private term(): SearchNode {
    let node = this.factor();
    for (;;) {
      if (this.match("AND")) {
        node = { type: "AND", left: node, right: this.factor() };
        continue;
      }
      const next = this.peek();
      if (next && (next.type === "WORD" || next.type === "LPAREN")) {
        node = { type: "AND", left: node, right: this.factor() };
        continue;
      }
      break;
    }
    return node;
  }

  /** Factor : '(' Expression ')' | WORD */
  private factor(): SearchNode {
    if (this.match("LPAREN")) {
      const node = this.expression();
      this.match("RPAREN");
      return node;
    }
    const token = this.peek();
    if (token) {
      this.consume();
      return { type: "TERM", value: token.value };
    }
    throw new Error("검색어가 갑자기 끝났습니다");
  }
}

export function parseSearchQuery(query: string): SearchNode | null {
  const tokens = tokenize(query);
  if (tokens.length === 0) return null;
  return new Parser(tokens).parse();
}

/** PostgREST 필터 문자열로 변환 (supabase.or 에 그대로 넘긴다) */
export function buildPostgrestFilter(node: SearchNode, columns: string[]): string {
  if (node.type === "TERM") {
    // 쉼표·괄호는 PostgREST 문법을 깨뜨리므로 검색어에서 제거한다
    const safe = node.value.replace(/[,()]/g, " ").trim();
    return columns.map((col) => `${col}.ilike.%${safe}%`).join(",");
  }
  const left = buildPostgrestFilter(node.left, columns);
  const right = buildPostgrestFilter(node.right, columns);
  return node.type === "AND" ? `and(${left},${right})` : `or(${left},${right})`;
}
