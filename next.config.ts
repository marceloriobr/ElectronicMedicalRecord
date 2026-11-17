import type { NextConfig } from "next";

// No GitHub Codespaces o app é acessado por https://<codespace>-<porta>.app.github.dev.
// Liberamos apenas o host DESTE codespace (não *.app.github.dev, que permitiria
// requisições vindas do codespace de qualquer pessoa).
const codespaceHosts =
  process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? [3000, 3001].map(
        (port) =>
          `${process.env.CODESPACE_NAME}-${port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`,
      )
    : [];

/**
 * Cabeçalhos de segurança fixos (a Content-Security-Policy, que leva um nonce por requisição, fica em
 * src/proxy.ts). HSTS só em produção: em desenvolvimento o app também é acessado por http://localhost.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Nenhuma URL interna (que tem ids de paciente) vaza para outros sites pelo Referer.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // cacheComponents fica desligado de propósito: as páginas internas
  // conferem a sessão no banco a cada requisição.
  allowedDevOrigins: codespaceHosts,
  experimental: {
    // O proxy do Codespaces repassa x-forwarded-host = <codespace>-3000.app.github.dev,
    // mas reescreve o cabeçalho Origin para localhost:<porta>. Sem isso o Next.js
    // recusa os formulários com "Invalid Server Actions request".
    // (A proteção contra CSRF continua garantida pelo cookie de sessão SameSite=Lax.)
    serverActions: {
      allowedOrigins: codespaceHosts.length ? [...codespaceHosts, "localhost:3000", "localhost:3001"] : [],
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
