CREATE TABLE `clinical_addenda` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`record_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`key_version` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `clinical_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clinical_addenda_record_idx` ON `clinical_addenda` (`record_id`);--> statement-breakpoint
CREATE TABLE `clinical_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`key_version` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clinical_profiles_patient_idx` ON `clinical_profiles` (`patient_id`,`id`);--> statement-breakpoint
CREATE TABLE `clinical_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`appointment_id` integer,
	`kind` text NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`key_version` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finalized_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "clinical_records_kind_check" CHECK("clinical_records"."kind" in ('anamnese', 'evolucao')),
	CONSTRAINT "clinical_records_status_check" CHECK("clinical_records"."status" in ('rascunho', 'finalizado')),
	CONSTRAINT "clinical_records_finalized_check" CHECK("clinical_records"."status" <> 'finalizado' or "clinical_records"."finalized_at" is not null)
);
--> statement-breakpoint
CREATE INDEX `clinical_records_patient_idx` ON `clinical_records` (`patient_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`record_id` integer,
	`type` text NOT NULL,
	`status` text DEFAULT 'emitida' NOT NULL,
	`doctor_name` text NOT NULL,
	`doctor_crm` text NOT NULL,
	`doctor_crm_uf` text NOT NULL,
	`key_version` integer NOT NULL,
	`payload` text NOT NULL,
	`issued_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`cancelled_at` integer,
	`cancelled_by` integer,
	`cancel_reason` text,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`record_id`) REFERENCES `clinical_records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "prescriptions_type_check" CHECK("prescriptions"."type" in ('simples', 'controle_especial')),
	CONSTRAINT "prescriptions_status_check" CHECK("prescriptions"."status" in ('emitida', 'cancelada')),
	CONSTRAINT "prescriptions_cancel_check" CHECK("prescriptions"."status" <> 'cancelada' or ("prescriptions"."cancel_reason" is not null and "prescriptions"."cancelled_at" is not null and "prescriptions"."cancelled_by" is not null))
);
--> statement-breakpoint
CREATE INDEX `prescriptions_patient_idx` ON `prescriptions` (`patient_id`,`issued_at`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_seen_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Guardrails (adicionados manualmente): prontuário não se apaga (Res. CFM 1.821/2007, Lei 13.787/2018).
-- Registro clínico: só rascunho pode ser alterado; autor, paciente e tipo nunca mudam; finalizado é imutável.
CREATE TRIGGER `clinical_records_no_delete` BEFORE DELETE ON `clinical_records`
BEGIN SELECT RAISE(ABORT, 'registros do prontuario nao podem ser excluidos'); END;--> statement-breakpoint
CREATE TRIGGER `clinical_records_immutable` BEFORE UPDATE ON `clinical_records`
WHEN OLD.status = 'finalizado'
  OR NEW.author_id <> OLD.author_id
  OR NEW.patient_id <> OLD.patient_id
  OR NEW.kind <> OLD.kind
  OR NEW.created_at <> OLD.created_at
BEGIN SELECT RAISE(ABORT, 'registro finalizado e imutavel: use o aditamento'); END;--> statement-breakpoint
CREATE TRIGGER `clinical_addenda_no_update` BEFORE UPDATE ON `clinical_addenda`
BEGIN SELECT RAISE(ABORT, 'aditamentos sao somente de inclusao'); END;--> statement-breakpoint
CREATE TRIGGER `clinical_addenda_no_delete` BEFORE DELETE ON `clinical_addenda`
BEGIN SELECT RAISE(ABORT, 'aditamentos sao somente de inclusao'); END;--> statement-breakpoint
-- Aditamento só em registro finalizado.
CREATE TRIGGER `clinical_addenda_finalized_only` BEFORE INSERT ON `clinical_addenda`
WHEN (SELECT status FROM clinical_records WHERE id = NEW.record_id) IS NOT 'finalizado'
BEGIN SELECT RAISE(ABORT, 'aditamento so e permitido em registro finalizado'); END;--> statement-breakpoint
CREATE TRIGGER `clinical_profiles_no_update` BEFORE UPDATE ON `clinical_profiles`
BEGIN SELECT RAISE(ABORT, 'historico de alergias/medicamentos e somente de inclusao'); END;--> statement-breakpoint
CREATE TRIGGER `clinical_profiles_no_delete` BEFORE DELETE ON `clinical_profiles`
BEGIN SELECT RAISE(ABORT, 'historico de alergias/medicamentos e somente de inclusao'); END;--> statement-breakpoint
-- Receita: imutável após emitida; a única alteração permitida é emitida -> cancelada (com motivo).
CREATE TRIGGER `prescriptions_no_delete` BEFORE DELETE ON `prescriptions`
BEGIN SELECT RAISE(ABORT, 'receitas nao podem ser excluidas: use o cancelamento'); END;--> statement-breakpoint
CREATE TRIGGER `prescriptions_immutable` BEFORE UPDATE ON `prescriptions`
WHEN OLD.status <> 'emitida'
  OR NEW.status <> 'cancelada'
  OR NEW.payload <> OLD.payload
  OR NEW.key_version <> OLD.key_version
  OR NEW.type <> OLD.type
  OR NEW.patient_id <> OLD.patient_id
  OR NEW.author_id <> OLD.author_id
  OR NEW.issued_at <> OLD.issued_at
  OR NEW.doctor_name <> OLD.doctor_name
  OR NEW.doctor_crm <> OLD.doctor_crm
  OR NEW.doctor_crm_uf <> OLD.doctor_crm_uf
  OR NEW.record_id IS NOT OLD.record_id
BEGIN SELECT RAISE(ABORT, 'receita emitida e imutavel: apenas o cancelamento e permitido'); END;
