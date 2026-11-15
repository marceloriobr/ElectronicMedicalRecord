import { NextResponse, type NextRequest } from "next/server";

/**
 * Verificação otimista: sem cookie de sessão, nem tenta renderizar as áreas internas.
 * A verificação real (sessão no banco, perfil, validade da senha) é feita em requireUser().
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("emr_session")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/painel/:path*", "/usuarios/:path*", "/pacientes/:path*", "/agenda/:path*","/alterar-senha"],
};
