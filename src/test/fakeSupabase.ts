// A stand-in for a supabase-js client that records each query and answers it
// from a test-supplied function. A query is a chain of builder calls
// (from("t").update(x).in("id", ids)...) that resolves when awaited, like the
// real PostgREST builder.

export type Query = {
  table?: string;
  rpc?: string;
  args?: unknown;
  chain: [method: string, args: unknown[]][];
};

export type Reply = {
  data?: unknown;
  error?: { message: string } | null;
  status?: number;
};

export function fakeSupabase(respond: (q: Query) => Reply | Promise<Reply> = () => ({})) {
  const queries: Query[] = [];

  function builder(q: Query): unknown {
    const b: unknown = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve()
                .then(() => respond(q))
                .then((r) => ({ data: null, error: null, status: 200, ...r }))
                .then(resolve, reject);
          }
          return (...args: unknown[]) => {
            q.chain.push([String(prop), args]);
            return b;
          };
        },
      }
    );
    return b;
  }

  const client = {
    from(table: string) {
      const q: Query = { table, chain: [] };
      queries.push(q);
      return builder(q);
    },
    rpc(fn: string, args: unknown) {
      const q: Query = { rpc: fn, args, chain: [] };
      queries.push(q);
      return builder(q);
    },
  };

  return { client, queries };
}

// The arguments of the first `method` call in a query's chain.
export function argsOf(q: Query, method: string): unknown[] | undefined {
  return q.chain.find(([m]) => m === method)?.[1];
}

export function methods(q: Query): string[] {
  return q.chain.map(([m]) => m);
}
