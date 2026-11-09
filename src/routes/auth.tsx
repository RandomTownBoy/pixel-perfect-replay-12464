import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk — Kyoka Live Studio" },
      { name: "description", content: "Sign in to your Kyoka Live Studio dashboard." },
      { property: "og:title", content: "Masuk — Kyoka Live Studio" },
      { property: "og:description", content: "Sign in to your livestream control center." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) nav({ to: "/dashboard" }); });
    const { data } = supabase.auth.onAuthStateChange((e, s) => { if (e === "SIGNED_IN" && s) nav({ to: "/dashboard" }); });
    return () => data.subscription.unsubscribe();
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/dashboard" } });
    setBusy(false);
    if (error) return void toast.error(error.message);
    if (mode === "up") setSent(true);
  };
  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(r.error.message);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-panel p-7 shadow-glow">
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-party font-display text-xl font-black shadow-pop">K</span>
          <h1 className="mt-3 text-xl font-bold">KYOKA LIVE STUDIO</h1>
          <p className="text-sm text-muted-foreground">{mode === "in" ? "Masuk ke dashboard" : "Bikin akun kreator"}</p>
        </div>
        {sent ? (
          <p className="rounded-xl bg-success/15 p-4 text-center text-sm text-success">Cek email kamu untuk konfirmasi akun, lalu masuk di sini.</p>
        ) : (
          <>
            <button type="button" onClick={google} className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-[#8E918F] bg-[#131314] text-sm font-medium text-[#E3E3E3]">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
              Continue with Google
            </button>
            <div className="my-4 text-center text-xs text-muted-foreground">atau</div>
            <form onSubmit={submit} className="space-y-3">
              <Input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button type="submit" size="lg" variant="live" className="w-full" disabled={busy}>{mode === "in" ? "Masuk" : "Daftar"}</Button>
            </form>
            <button className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
              {mode === "in" ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
