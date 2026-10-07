"use client";
// Last-resort error screen (the root layout itself failed), so it brings its own <html>.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#07070d", color: "#f4f4fb", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <div style={{ fontSize: 44 }}>🛠️</div>
          <h2>Something went wrong</h2>
          <button onClick={reset} style={{ padding: "10px 18px", borderRadius: 12, border: 0, background: "#ff2e88", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
