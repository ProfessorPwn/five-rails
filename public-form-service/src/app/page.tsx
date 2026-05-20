// The root path is intentionally a blank operational page. Strangers should
// not browse the form service; they should only ever hit /p/<slug> via a
// link from a campaign. Bots that try / get a near-empty page.

export default function HomePage() {
  return (
    <main style={{ padding: "60px 20px", textAlign: "center", color: "var(--dim)" }}>
      <p style={{ fontSize: 12 }}>Service operational.</p>
    </main>
  );
}
