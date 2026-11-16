export const inputClass =
  "mt-1 block w-full rounded-md border border-brand-gray bg-white px-3 py-2.5 text-ink shadow-sm " +
  "placeholder:text-ink/40 focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/30 " +
  "aria-[invalid=true]:border-coral";

export const labelClass = "block text-sm font-semibold text-petrol";

export const primaryButtonClass =
  "inline-flex items-center justify-center rounded-md bg-coral-dark px-4 py-2.5 font-semibold text-white " +
  "shadow-sm transition-colors hover:bg-coral-darker focus:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-coral/50 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70";

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-petrol/30 bg-white px-4 py-2.5 " +
  "font-semibold text-petrol transition-colors hover:bg-petrol/5 focus:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-petrol/30";

/** Campo compacto (largura definida por quem usa): mesmo visual do inputClass, sem largura total. */
export const compactInputClass = inputClass.replace("block w-full", "inline-block").replace("mt-1 ", "");
