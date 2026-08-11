# Auto Page Loader Rearm Design

## Problem

`AutoPageLoader` disarms after one intersection and only rearms after observing `isIntersecting=false`. While a buffer request is running the observer is disconnected, and the 600px root margin often keeps the sentinel intersecting after a short page is revealed. The missed exit leaves automatic reveal permanently disarmed.

## Design

Keep the existing one-trigger latch, but reset it when the pagination state makes forward progress: a buffered page is successfully revealed and the loader renders for the following page. `AutoPageLoader` receives `pageProgress={visiblePageCount}` from each paginated page and rearms once when that number changes. The loader must still suppress repeated callbacks for the same visible page, must not trigger more than once for one `pageProgress` value, and must retain its manual button fallback.

The implementation changes only `AutoPageLoader`, its three callers, and focused tests. It does not change API requests, query priorities, buffering depth, page size, or the 600px observation margin.

## Acceptance

- A loader that remains intersecting can automatically reveal the following page after the prior page count advances.
- Repeated intersection callbacks before page progress trigger only once.
- Focused pagination tests, full Web tests, typecheck, and production build pass.
