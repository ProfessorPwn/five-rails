import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lock the form service down: no iframing (clickjacking), no MIME sniffing,
  // strict referrer policy, and basic XSS protection. Cross-origin requests
  // to /api/submit/* are gated separately by an explicit Origin allowlist.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
