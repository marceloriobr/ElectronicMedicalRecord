import "server-only";

/** Identificação do consultório impressa nas receitas (Res. CFM 2.299/2021; Portaria 344/1998). */
export type ClinicInfo = { name: string; address: string; phone: string };

export function getClinicInfo(): ClinicInfo {
  return {
    name: process.env.CLINIC_NAME?.trim() || "Consultório médico",
    address: process.env.CLINIC_ADDRESS?.trim() || "",
    phone: process.env.CLINIC_PHONE?.trim() || "",
  };
}
