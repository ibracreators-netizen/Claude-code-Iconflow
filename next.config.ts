import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pas de pastille d'outils Next.js en développement : elle masquait les onglets du bas sur téléphone.
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
    // Une page visitée il y a moins de 30 s se rouvre instantanément depuis le cache du navigateur (retour arrière, allers-retours).
    staleTimes: { dynamic: 30, static: 300 },
  },
  async rewrites() {
    // Découverte OAuth du serveur MCP : les métadonnées .well-known pointent vers les routes /api/mcp/wk.
    return [
      { source: "/.well-known/oauth-protected-resource", destination: "/api/mcp/wk/protected-resource" },
      { source: "/.well-known/oauth-protected-resource/api/mcp", destination: "/api/mcp/wk/protected-resource" },
      { source: "/.well-known/oauth-authorization-server", destination: "/api/mcp/wk/authorization-server" },
      { source: "/.well-known/oauth-authorization-server/api/mcp", destination: "/api/mcp/wk/authorization-server" },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Lien personnel de saisie des KPI (/kpi/<jeton>) : l'adresse n'est jamais transmise (en-tête Referer), même
        // vers ce site, et la page n'est jamais indexée. Placée après la règle générale, cette règle la remplace ici.
        source: "/kpi/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
