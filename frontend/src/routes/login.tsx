import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { api, setAuthToken, apiErrorMessage } from "@/lib/api";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign In · SmartQueue" }],
  }),
  beforeLoad: () => {
    if (
      typeof window !== "undefined" &&
      (window.localStorage.getItem("helix.auth") || window.sessionStorage.getItem("helix.auth"))
    ) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = true;
    const t = setTimeout(() => setRevealed(true), 1800);
    return () => clearTimeout(t);
  }, []);

  // Focus username input after the form animates in
  useEffect(() => {
    if (revealed) {
      const t = setTimeout(() => usernameRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [revealed]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { access } = await api.login(username, password);
      setAuthToken(access, rememberMe);
      await router.navigate({ to: "/queues" });
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Invalid credentials. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: "#061529" }}>

      {/* ── Video panel — full width for 1.8s, then slides to 58% ── */}
      <motion.div
        className="relative h-full flex-shrink-0 overflow-hidden"
        initial={{ width: "100%" }}
        animate={{ width: revealed ? "58%" : "100%" }}
        transition={{ duration: 0.85, ease: [0.32, 0.72, 0, 1] }}
      >
        <video
          ref={videoRef}
          src="/login_bg.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
        />

        {/* Overlay — always visible so dark screens show branding even if video blocks */}
        <motion.div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(4,20,45,0.35) 0%, rgba(4,20,45,0.1) 50%, rgba(4,20,45,0.65) 100%)",
          }}
          animate={{
            background: revealed
              ? "linear-gradient(to right, rgba(4,20,45,0.3) 0%, rgba(4,20,45,0.12) 60%, rgba(4,20,45,0.6) 100%)"
              : "linear-gradient(to bottom, rgba(4,20,45,0.35) 0%, rgba(4,20,45,0.1) 50%, rgba(4,20,45,0.65) 100%)",
          }}
          transition={{ duration: 0.85 }}
        />

        {/* Branding — visible during intro, fades as form slides in */}
        <AnimatePresence>
          {!revealed && (
            <motion.div
              key="intro-brand"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="absolute bottom-14 left-12 text-white"
            >
              <p className="text-[11px] uppercase tracking-[0.25em] text-white/50 mb-2">SmartQueue AI</p>
              <h1 className="text-4xl font-bold leading-tight">Intelligent<br />Queue Management</h1>
              <p className="mt-3 text-sm text-white/60 max-w-xs">
                Reduce wait times. Improve patient experience. Real-time operations.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Form panel — slides in from right after 1.8s ── */}
      <AnimatePresence>
        {revealed && (
          <motion.div
            key="form"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ duration: 0.75, ease: [0.32, 0.72, 0, 1], delay: 0.08 }}
            className="relative flex flex-1 h-full flex-col items-center justify-center px-10 py-8 overflow-y-auto"
            style={{ background: "#ffffff" }}
          >
            <div className="w-full max-w-[400px]">

              {/* Lock icon + heading */}
              <div className="flex flex-col items-center mb-6">
                <div className="rounded-2xl bg-[#E8F1FF] flex items-center justify-center mb-3 shadow-sm" style={{ width: 52, height: 52 }}>
                  <svg className="w-6 h-6 text-[#0066FF]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Welcome Back!</h2>
                <p className="mt-1 text-xs text-slate-500 text-center">
                  Sign in to access your smart queue dashboard
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username */}
                <div>
                  <label htmlFor="login-username" className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <input
                      id="login-username"
                      ref={usernameRef}
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      disabled={loading}
                      autoComplete="username"
                      placeholder="Enter your username"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-[#0066FF] focus:bg-white focus:ring-2 focus:ring-[#0066FF]/20 disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="login-password" className="mb-1.5 block text-xs font-semibold text-slate-700">Password</label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      id="login-password"
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-10 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-[#0066FF] focus:bg-white focus:ring-2 focus:ring-[#0066FF]/20 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      aria-label={showPwd ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember me */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#0066FF]"
                    />
                    <span className="text-xs text-slate-600">Remember me</span>
                  </label>
                  <span className="text-xs text-slate-400">Forgot password? Contact IT admin.</span>
                </div>

                {/* Error */}
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600"
                  >
                    {error}
                  </motion.p>
                )}

                {/* Sign In */}
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={loading ? undefined : { scale: 1.01 }}
                  whileTap={loading ? undefined : { scale: 0.97 }}
                  className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: "#0066FF", boxShadow: "0 4px 18px rgba(0,102,255,0.35)" }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Signing in…
                    </span>
                  ) : "Sign In"}
                </motion.button>
              </form>

              <p className="mt-5 text-center text-xs text-slate-500">
                Don't have an account?{" "}
                <span className="font-semibold text-slate-600">Contact your Administrator.</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
