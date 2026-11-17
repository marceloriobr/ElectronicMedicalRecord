/**
 * IP do cliente para auditoria e limite de tentativas.
 *
 * O cabeçalho X-Forwarded-For pode ser forjado por quem faz a requisição: só a parte ACRESCENTADA pelos
 * proxies do próprio consultório é confiável. TRUSTED_PROXY_HOPS diz quantos proxies confiáveis existem
 * na frente do app (padrão 1: um proxy reverso com HTTPS). O IP usado é o N-ésimo a partir do FIM da lista.
 * Com 0, o cabeçalho é ignorado e o IP não é registrado.
 */
export function clientIpFrom(h: { get(name: string): string | null }): string | null {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
  if (!Number.isInteger(hops) || hops < 1) return null;
  const chain = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = chain.at(-hops);
  // Só aceita o que parece IP (v4/v6): o valor vai para o banco e para comparações.
  return ip && /^[0-9a-fA-F.:]{3,45}$/.test(ip) ? ip : null;
}
