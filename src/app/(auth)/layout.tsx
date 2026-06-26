export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #C41E3A 0%, #7A1228 60%, #4A0B1A 100%)" }}
    >
      {/* Decorative gold ring */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full border-[40px] border-gold/10" />
        <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full border-[30px] border-gold/10" />
      </div>
      <div className="relative z-10 w-full flex justify-center">
        {children}
      </div>
    </div>
  );
}
