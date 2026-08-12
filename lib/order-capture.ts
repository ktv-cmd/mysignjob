// URL contract for the desktop → phone hand-off: the QR rendered by
// components/order/PhoneHandoff.tsx links to /order/new with this flag set, and
// app/(client)/order/new/page.tsx reads it to open the guided camera straight
// away. Lives in its own module (rather than beside the QR component) so the
// server page can import it without pulling a "use client" module into the
// server graph.
export const CAPTURE_QUERY_FLAG = "capture"
