CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`resource_id` text,
	`patient_id` integer,
	`ip` text,
	`user_agent` text,
	`details` text
);
--> statement-breakpoint
CREATE INDEX `audit_log_patient_idx` ON `audit_log` (`patient_id`,`at`);--> statement-breakpoint
CREATE INDEX `audit_log_user_idx` ON `audit_log` (`user_id`,`at`);--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE TABLE `patient_consents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`channel` text NOT NULL,
	`granted` integer NOT NULL,
	`term_version` text NOT NULL,
	`recorded_by` integer NOT NULL,
	`recorded_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "patient_consents_channel_check" CHECK("patient_consents"."channel" in ('whatsapp', 'email'))
);
--> statement-breakpoint
CREATE INDEX `patient_consents_patient_idx` ON `patient_consents` (`patient_id`,`channel`);--> statement-breakpoint
CREATE TABLE `patients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text NOT NULL,
	`social_name` text,
	`search_name` text NOT NULL,
	`birth_date` text NOT NULL,
	`sex` text NOT NULL,
	`cpf` text NOT NULL,
	`cns` text,
	`phone` text NOT NULL,
	`email` text,
	`cep` text,
	`street` text,
	`number` text,
	`complement` text,
	`district` text,
	`city` text,
	`uf` text,
	`guardian_name` text,
	`guardian_cpf` text,
	`guardian_phone` text,
	`guardian_relationship` text,
	`coverage` text DEFAULT 'particular' NOT NULL,
	`insurer_name` text,
	`insurer_card_number` text,
	`active` integer DEFAULT true NOT NULL,
	`inactivated_at` integer,
	`inactivated_by` integer,
	`inactivation_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_by` integer NOT NULL,
	CONSTRAINT "patients_sex_check" CHECK("patients"."sex" in ('feminino', 'masculino', 'intersexo')),
	CONSTRAINT "patients_coverage_check" CHECK("patients"."coverage" in ('particular', 'convenio')),
	CONSTRAINT "patients_cpf_check" CHECK(length("patients"."cpf") = 11),
	CONSTRAINT "patients_convenio_check" CHECK("patients"."coverage" <> 'convenio' or "patients"."insurer_name" is not null),
	CONSTRAINT "patients_inactive_check" CHECK("patients"."active" = 1 or "patients"."inactivation_reason" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patients_cpf_unique` ON `patients` (`cpf`);--> statement-breakpoint
CREATE UNIQUE INDEX `patients_cns_unique` ON `patients` (`cns`);--> statement-breakpoint
CREATE INDEX `patients_search_name_idx` ON `patients` (`search_name`);--> statement-breakpoint
CREATE INDEX `patients_birth_date_idx` ON `patients` (`birth_date`);--> statement-breakpoint
-- Guardrails LGPD/CFM (adicionados manualmente): trilha de auditoria append-only
-- e proibição de exclusão física de pacientes e consentimentos.
CREATE TRIGGER `audit_log_no_update` BEFORE UPDATE ON `audit_log`
BEGIN SELECT RAISE(ABORT, 'audit_log e somente de inclusao (append-only)'); END;--> statement-breakpoint
CREATE TRIGGER `audit_log_no_delete` BEFORE DELETE ON `audit_log`
BEGIN SELECT RAISE(ABORT, 'audit_log e somente de inclusao (append-only)'); END;--> statement-breakpoint
CREATE TRIGGER `patients_no_delete` BEFORE DELETE ON `patients`
BEGIN SELECT RAISE(ABORT, 'pacientes nao podem ser excluidos: use a inativacao'); END;--> statement-breakpoint
CREATE TRIGGER `patient_consents_no_update` BEFORE UPDATE ON `patient_consents`
BEGIN SELECT RAISE(ABORT, 'historico de consentimentos e somente de inclusao'); END;--> statement-breakpoint
CREATE TRIGGER `patient_consents_no_delete` BEFORE DELETE ON `patient_consents`
BEGIN SELECT RAISE(ABORT, 'historico de consentimentos e somente de inclusao'); END;