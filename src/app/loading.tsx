// Shown the moment you tap into a list, the menu or one of its pages, while
// the server loads the data. Prefetched with the route, so navigation never
// looks stuck on the old screen.
export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-24"
    >
      <div className="panel mt-3">
        <p className="term-strip">
          <span aria-hidden>&gt;</span>
          <span>Loading</span>
          <span aria-hidden className="loading-cursor">
            █
          </span>
        </p>
        <div className="h-[64px]" />
      </div>
      <div className="panel h-40 opacity-60" />
    </main>
  );
}
