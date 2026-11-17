import { NextResponse, type NextRequest } from "next/server";

/** Áreas internas: sem cookie de sessão, nem tenta renderizar. Acrescente aqui cada nova rota protegida. */
const PROTECTED = ["/painel", "/usuarios", "/pacientes", "/agenda", "/impressao", "/alterar-senha"];

/**
 * Content-Security-Policy com nonce por requisição (guia do Next.js: content-security-policy).
 * Scripts só rodam com o nonce desta resposta; nada de origem externa; a página não pode ser embutida
 * em outro site (frame-ancestors) nem enviar formulário para fora (form-action).
 */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // Em desenvolvimento o React usa eval para depuração; em produção não.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Atributos style="" dos gráficos exigem 'unsafe-inline' em estilos (não em scripts).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * 1) Verificação OTIMISTA de sessão (a real — sessão no banco, perfil, validade da senha — é feita em
 *    requireUser()/requirePermission(), em cada página e Server Action).
 * 2) Cabeçalho CSP com nonce em todas as páginas.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtected && !request.cookies.has("emr_session")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp); // o Next lê daqui o nonce para os scripts dele

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Tudo, menos arquivos estáticos do Next e o favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
