import { LotusIcon } from "./lotus-icon";

export function BrandPanel({ subtitle }: { subtitle?: string }) {
  return (
    <section className="flex flex-col items-center justify-center bg-petrol px-8 py-12 text-center lg:w-1/2 lg:py-0">
      <p className="font-serif text-3xl uppercase tracking-[0.2em] text-gold sm:text-4xl">
        Dra. Verônica Avolio
      </p>
      <p className="mt-3 font-serif text-sm uppercase tracking-[0.25em] text-gold/80 sm:text-base">
        Geriatria &amp; Clínica Médica
      </p>
      <div className="mt-6 flex w-full max-w-sm items-center gap-4" aria-hidden="true">
        <span className="h-px flex-1 bg-coral" />
        <LotusIcon className="h-12 w-12 text-coral" />
        <span className="h-px flex-1 bg-coral" />
      </div>
      {subtitle && (
        <p className="mt-8 hidden max-w-sm text-sm leading-relaxed text-cream/70 lg:block">{subtitle}</p>
      )}
    </section>
  );
}
