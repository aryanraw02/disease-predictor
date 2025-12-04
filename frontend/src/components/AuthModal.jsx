// src/components/AuthModal.jsx
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import modalSvg from "../img/modal.svg"; // your project svg asset (preferred)

const fallbackImgUrl = "/mnt/data/fe521952-754b-44cf-a26d-7bcd82c627b1.png"; // uploaded file path (runtime will serve this)
const modalImgUrl =
  typeof modalSvg === "string" && modalSvg ? modalSvg : fallbackImgUrl;

/**
 * AuthModal
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - initialMode: "register" | "login"
 *  - apiBase: base backend URL (defaults to http://127.0.0.1:8000)
 *  - onAuthSuccess: (user, token) => void  // called after successful login/register
 *
 * Behavior:
 *  - register -> POST { username,email,password,role:'patient', age? } to /api/accounts/register/
 *    expects { token, username } on success
 *  - login -> POST { username, password } to /api/accounts/login/
 *    expects { token, username } on success
 *  - stores token in localStorage as "token" and sets axios header
 *  - shows backend errors inline (no alerts)
 *
 * UI/markup intentionally preserved to match your design.
 */
export default function AuthModal({
  open,
  onClose,
  initialMode = "register",
  apiBase = "http://127.0.0.1:8000",
  onAuthSuccess = () => {},
}) {
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [backendError, setBackendError] = useState(null);
  const backdropRef = useRef(null);
  const firstInputRef = useRef(null);
  const prevFocus = useRef(null);

  useEffect(() => {
    setMode(initialMode);
    // Reset error when modal opens/closes or mode changes
    setBackendError(null);
  }, [initialMode, open]);

  // focus management + body scroll lock
  useEffect(() => {
    if (open) {
      prevFocus.current = document.activeElement;
      document.body.style.overflow = "hidden";
      setTimeout(() => firstInputRef.current?.focus?.(), 0);
    } else {
      document.body.style.overflow = "";
      prevFocus.current?.focus?.();
      setBackendError(null);
      setLoading(false);
    }
    return () => (document.body.style.overflow = "");
  }, [open]);

  // close on ESC
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const BASE = apiBase.replace(/\/$/, "") + "/api/accounts";

  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) {
      e.stopPropagation();
      onClose();
    }
  };

  const handleCloseClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Reset modal state
    setBackendError(null);
    setLoading(false);
    // Close modal
    onClose();
  };

  const parseServerError = async (res) => {
    try {
      const data = await res.json();
      if (!data) return `${res.status} ${res.statusText}`;
      if (typeof data === "object") {
        // flatten common shapes
        if (data.detail) return data.detail;
        return Object.entries(data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
      }
      return String(data);
    } catch {
      return `${res.status} ${res.statusText}`;
    }
  };

  // <-- CORRECTED: notify & dispatch storage events for same-tab listeners
  const saveTokenAndNotify = (token, username) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify({ username }));
    axios.defaults.headers.common["Authorization"] = `Token ${token}`;

    // call parent callback (Header will navigate)
    onAuthSuccess({ username }, token);

    // Dispatch StorageEvent so header and other listeners update in the same tab immediately.
    // Note: programmatic StorageEvent with constructor isn't supported in some old browsers.
    try {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "user",
          newValue: localStorage.getItem("user"),
        })
      );
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "token",
          newValue: localStorage.getItem("token"),
        })
      );
    } catch (e) {
      // Fallback: dispatch a custom event our Header listens for
      window.dispatchEvent(new Event("auth:changed"));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBackendError(null);
    const form = new FormData(e.target);
    const payload = Object.fromEntries(form.entries());

    // basic validation
    if (
      !payload.email ||
      !payload.password ||
      (mode === "register" && !payload.username)
    ) {
      setBackendError("Please fill required fields.");
      return;
    }
    // password policy (for register)
    if (mode === "register") {
      const pwd = payload.password || "";
      const pwdPattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*\W).{8,}$/;
      if (!pwdPattern.test(pwd)) {
        setBackendError(
          "Password must be >=8 chars, include a letter, a digit and a special character."
        );
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "register") {
        const body = {
          username: payload.username,
          email: payload.email,
          password: payload.password,
          role: "patient", // required by backend; defaulting to patient
        };
        // include age if provided
        if (payload.age) body.age = Number(payload.age);

        const res = await fetch(`${BASE}/register/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const msg = await parseServerError(res);
          throw new Error(msg);
        }

        // expected response: { token, username }
        const data = await res.json();
        if (!data?.token)
          throw new Error("Registration succeeded but no token returned.");
        saveTokenAndNotify(data.token, data.username ?? body.username);

        // close and return
        setLoading(false);
        onClose();
        return;
      }

      // login
      const loginRes = await fetch(`${BASE}/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: payload.username || payload.email,
          password: payload.password,
        }),
      });

      if (!loginRes.ok) {
        const msg = await parseServerError(loginRes);
        throw new Error(msg);
      }

      const loginData = await loginRes.json();
      if (!loginData?.token)
        throw new Error("Login succeeded but no token returned.");
      saveTokenAndNotify(
        loginData.token,
        loginData.username ?? (payload.username || payload.email)
      );

      setLoading(false);
      onClose();
    } catch (err) {
      setLoading(false);
      setBackendError(err?.message || "Network error");
    }
  };

  return (
    <div
      ref={backdropRef}
      onMouseDown={handleBackdropClick}
      className="fixed inset-0 z-[70] flex items-center justify-center py-8 px-4"
      aria-modal="true"
      role="dialog"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-pink-900/30 to-blue-900/40 backdrop-blur-md" />

      <div
        className="relative z-10 max-w-4xl w-full bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 border border-white/20"
        style={{
          boxShadow:
            "0 20px 60px rgba(102, 126, 234, 0.2), 0 8px 20px rgba(0, 0, 0, 0.1)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Illustration */}
        <div className="hidden lg:flex items-center justify-center bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-8 relative overflow-hidden">
          {/* Decorative gradient orbs */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-purple-300/30 to-pink-300/30 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-blue-300/30 to-cyan-300/30 rounded-full blur-3xl" />

          <img
            src={modalImgUrl}
            alt="illustration"
            className="max-w-[320px] w-full h-auto object-contain select-none relative z-10 drop-shadow-2xl transform hover:scale-105 transition-transform duration-500"
            draggable="false"
          />
        </div>

        {/* Form */}
        <div className="p-6 lg:p-8 relative">
          {/* Close button */}
          <div className="flex justify-end -mt-2 -mr-2 mb-3">
            <button
              onClick={handleCloseClick}
              className="w-8 h-8 rounded-full border border-purple-200 bg-white/80 backdrop-blur flex items-center justify-center text-slate-700 hover:bg-purple-50 hover:border-purple-300 transition-all hover:rotate-90 duration-300"
              aria-label="Close"
              type="button"
            >
              ✕
            </button>
          </div>

          <div className="mt-1">
            {/* Badge */}
            <div className="inline-block mb-3 px-3 py-1.5 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full">
              <span className="text-xs font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                {mode === "register" ? "✨ GET STARTED" : "👋 WELCOME BACK"}
              </span>
            </div>

            <h2 className="text-2xl lg:text-3xl font-extrabold mb-2 bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
              {mode === "register" ? "Sign Up Now!" : "Hello Again!"}
            </h2>

            <p className="text-slate-600 mb-4 text-sm">
              {mode === "register"
                ? "Access personalized healthcare services"
                : "Welcome back — you've been missed!"}
            </p>

            {backendError && (
              <div className="mb-3 p-2.5 text-xs bg-red-50 border border-red-200 rounded-lg text-red-700 whitespace-pre-wrap">
                {backendError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "register" && (
                <div className="relative">
                  <input
                    name="name"
                    type="text"
                    placeholder="Full name"
                    className="w-full border-2 border-purple-100 rounded-xl px-3.5 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent transition-all bg-white/50 backdrop-blur"
                  />
                </div>
              )}

              <div className="relative">
                <input
                  name="email"
                  type="email"
                  placeholder="Email *"
                  required
                  className="w-full border-2 border-purple-100 rounded-xl px-3.5 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent transition-all bg-white/50 backdrop-blur"
                  ref={mode === "register" ? null : firstInputRef}
                />
              </div>

              <div className="relative">
                <input
                  name="username"
                  type="text"
                  placeholder={
                    mode === "register" ? "Username *" : "Username or Email *"
                  }
                  required
                  className="w-full border-2 border-purple-100 rounded-xl px-3.5 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent transition-all bg-white/50 backdrop-blur"
                  ref={mode === "register" ? firstInputRef : null}
                />
              </div>

              {mode === "register" && (
                <div className="relative">
                  <input
                    name="age"
                    type="number"
                    placeholder="Age"
                    defaultValue={21}
                    min={1}
                    className="w-full border-2 border-purple-100 rounded-xl px-3.5 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent transition-all bg-white/50 backdrop-blur"
                  />
                </div>
              )}

              <div className="relative">
                <input
                  name="password"
                  type="password"
                  placeholder="Password *"
                  required
                  className="w-full border-2 border-purple-100 rounded-xl px-3.5 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent transition-all bg-white/50 backdrop-blur"
                />
              </div>

              {mode === "register" && (
                <p className="text-xs text-slate-500 bg-purple-50 p-2 rounded-lg">
                  Password must be at least 8 characters long, contain at least
                  1 letter, 1 digit, and 1 special character.
                </p>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex justify-center items-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      {mode === "register"
                        ? "Creating account..."
                        : "Signing in..."}
                    </span>
                  ) : mode === "register" ? (
                    "CREATE ACCOUNT"
                  ) : (
                    "SIGN IN"
                  )}
                </button>
              </div>
            </form>

            <div className="mt-4 text-xs text-center">
              {mode === "register" ? (
                <p className="text-slate-600">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setBackendError(null);
                    }}
                    className="font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent hover:underline ml-1"
                  >
                    Login
                  </button>
                </p>
              ) : (
                <p className="text-slate-600">
                  New here?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("register");
                      setBackendError(null);
                    }}
                    className="font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent hover:underline ml-1"
                  >
                    Register
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
