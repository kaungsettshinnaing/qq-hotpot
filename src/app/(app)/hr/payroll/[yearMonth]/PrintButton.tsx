"use client";

// window.print() needs a browser event handler, which a Server Component
// cannot provide — wiring onClick directly onto a server-rendered button
// throws "Event handlers cannot be passed to Client Component props" at
// request time and 500s the whole page. Shared by the payslip and the
// payroll summary, both of which are Server Components.
export default function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-brand">
      {label}
    </button>
  );
}
