export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border p-5 ${className}`}
      style={{ background: "var(--gx-surface)", borderColor: "var(--gx-edge)" }}
    >
      {children}
    </div>
  );
}
