/**
 * Cadastra pacientes FICTÍCIOS para testes manuais e demonstrações.
 * Nomes inventados, CPFs gerados (dígitos válidos), telefones e e-mails fictícios (@exemplo.com).
 * Nunca use dados reais aqui (CLAUDE.md, seção 4.2).
 *
 * Uso: npm run db:seed-pacientes            (banco do .env.local)
 *      DATABASE_FILE=data/test.db npm run db:seed-pacientes
 *
 * Idempotente: pacientes cujo CPF já existe são ignorados.
 * Atenção: pacientes não podem ser excluídos (gatilho no banco) — apenas inativados.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { auditLog, patients, users } from "../src/db/schema";
import { patientFormSchema, type PatientFormInput } from "../src/lib/patient-schema";
import { createPatient, PatientError, setPatientActive } from "../src/lib/patient-service";

/** Gerador pseudoaleatório determinístico: mesmos CPFs a cada execução (idempotência). */
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}
const rand = rng(20261116);

function fakeCpf() {
  const d = Array.from({ length: 9 }, () => Math.floor(rand() * 10));
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += d[i] * (n + 1 - i);
    d.push(((sum * 10) % 11) % 10);
  }
  return d.join("");
}
const fakePhone = () => `119${String(Math.floor(rand() * 1e8)).padStart(8, "0")}`;

type Seed = Partial<PatientFormInput> & {
  fullName: string;
  birthDate: string;
  sex: "feminino" | "masculino" | "intersexo";
  inactivate?: string;
};

const SEEDS: Seed[] = [
  { fullName: "Aurora Teixeira Lindemberg", birthDate: "1938-03-12", sex: "feminino", coverage: "convenio", insurerName: "Saúde Exemplo", consentWhatsapp: true },
  { fullName: "Benedito Ramalho Quintela", birthDate: "1941-07-28", sex: "masculino", consentWhatsapp: true, consentEmail: true },
  { fullName: "Cecília Vasconcelos Amarante", birthDate: "1945-11-02", sex: "feminino", coverage: "convenio", insurerName: "Vida Fictícia", consentEmail: true },
  { fullName: "Durval Pacheco Brandão", birthDate: "1936-01-19", sex: "masculino", guardianName: "Helena Pacheco Brandão", guardianRelationship: "Filha" },
  { fullName: "Eulália Fonseca Rebouças", birthDate: "1950-05-30", sex: "feminino", consentWhatsapp: true },
  { fullName: "Florisvaldo Neves Azevedo", birthDate: "1943-09-14", sex: "masculino", coverage: "convenio", insurerName: "Saúde Exemplo" },
  { fullName: "Georgina Albuquerque Tavares", birthDate: "1939-12-25", sex: "feminino", socialName: "Gina Tavares", consentWhatsapp: true, consentEmail: true },
  { fullName: "Hermínio Castro Valadares", birthDate: "1947-02-08", sex: "masculino" },
  { fullName: "Iracema Lopes Bittencourt", birthDate: "1952-08-21", sex: "feminino", coverage: "convenio", insurerName: "Vida Fictícia", consentWhatsapp: true },
  { fullName: "Jovelino Prado Siqueira", birthDate: "1940-04-04", sex: "masculino", consentEmail: true },
  { fullName: "Leonor Guimarães Falcão", birthDate: "1958-10-10", sex: "feminino", consentWhatsapp: true },
  { fullName: "Mauro Tenório Esteves", birthDate: "1962-06-17", sex: "masculino", coverage: "convenio", insurerName: "Saúde Exemplo" },
  { fullName: "Nair Coutinho Belmonte", birthDate: "1935-08-30", sex: "feminino", guardianName: "Otávio Coutinho Belmonte", guardianRelationship: "Filho", consentWhatsapp: true },
  { fullName: "Pietro Arantes Moura", birthDate: "2012-03-15", sex: "masculino", guardianName: "Silvana Arantes Moura", guardianRelationship: "Mãe" },
  { fullName: "Rosalina Duarte Peixoto", birthDate: "1944-01-07", sex: "feminino", inactivate: "Cadastro fictício inativado para teste" },
];

const DISTRICTS = ["Centro", "Jardim Exemplo", "Vila Fictícia", "Bela Vista"];

async function main() {
  const admin = db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).get();
  if (!admin) {
    console.error("Nenhum administrador encontrado. Rode npm run db:seed primeiro.");
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;
  for (const [i, s] of SEEDS.entries()) {
    const cpf = fakeCpf();
    const phone = fakePhone();
    const guardianCpf = s.guardianName ? fakeCpf() : "";
    const guardianPhone = s.guardianName ? fakePhone() : "";
    if (db.select({ id: patients.id }).from(patients).where(eq(patients.cpf, cpf)).get()) {
      skipped++;
      continue;
    }
    const slug = s.fullName.split(" ")[0].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const input: PatientFormInput = {
      socialName: "",
      cns: "",
      email: s.consentEmail || i % 3 === 0 ? `${slug}.teste${i + 1}@exemplo.com` : "",
      cep: `0${1000000 + i * 1111}`.slice(0, 8),
      street: `Rua Fictícia ${i + 1}`,
      number: String(10 + i * 7),
      complement: "",
      district: DISTRICTS[i % DISTRICTS.length],
      city: "São Paulo",
      uf: "SP",
      guardianName: "",
      guardianRelationship: "",
      coverage: "particular",
      insurerName: "",
      insurerCardNumber: s.coverage === "convenio" ? String(900000 + i * 13) : "",
      consentWhatsapp: false,
      consentEmail: false,
      confirmHomonym: false,
      ...s,
      cpf,
      phone,
      guardianCpf,
      guardianPhone,
    };

    const parsed = patientFormSchema.safeParse(input);
    if (!parsed.success) {
      console.error(`Paciente fictício #${i + 1} inválido:`, parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`));
      process.exit(1);
    }
    try {
      const id = createPatient(parsed.data, admin.id);
      db.insert(auditLog)
        .values({ userId: admin.id, action: "criar", resource: "paciente", resourceId: String(id), patientId: id, details: JSON.stringify({ origem: "script_seed_ficticio" }) })
        .run();
      if (s.inactivate) {
        setPatientActive(id, false, admin.id, s.inactivate);
        db.insert(auditLog)
          .values({ userId: admin.id, action: "inativar", resource: "paciente", resourceId: String(id), patientId: id, details: JSON.stringify({ origem: "script_seed_ficticio" }) })
          .run();
      }
      created++;
    } catch (e) {
      if (e instanceof PatientError) {
        console.error(`Paciente fictício #${i + 1}: ${e.message}`);
        skipped++;
        continue;
      }
      throw e;
    }
  }
  console.log(`Pacientes fictícios: ${created} criados, ${skipped} já existentes/ignorados.`);
}

main();
