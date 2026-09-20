export function PageHeader({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-2xl font-semibold" style={{ color: "var(--gx-ink)" }}>
      {children}
    </h1>
  );
}
