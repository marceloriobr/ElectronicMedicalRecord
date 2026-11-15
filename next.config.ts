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

const nextConfig: NextConfig = {
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
