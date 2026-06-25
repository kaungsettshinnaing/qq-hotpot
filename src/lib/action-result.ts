// Shared result shape for client-invoked server actions.
export type ActionResult = { ok: true } | { ok: false; error: string };
