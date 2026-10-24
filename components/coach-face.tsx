"use client";

export function CoachFace({ state = "idle" }: { state?: "idle" | "thinking" | "speaking" }) {
  return (
    <span className={`coach-face ${state}`} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <rect className="face" x="6" y="6" width="52" height="52" rx="18" />
        <path className="eyes" d="M22 30h8M34 30h8" />
      </svg>
    </span>
  );
}
