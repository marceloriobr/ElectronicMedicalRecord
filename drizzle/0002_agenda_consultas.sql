CREATE TABLE `appointment_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`appointment_id` integer NOT NULL,
	`at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`user_id` integer NOT NULL,
	`event` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`from_starts_at` integer,
	`to_starts_at` integer,
	`from_doctor_id` integer,
	`to_doctor_id` integer,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `appointment_events_appointment_idx` ON `appointment_events` (`appointment_id`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doctor_id` integer NOT NULL,
	`patient_id` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'agendado' NOT NULL,
	`note` text,
	`overbooked` integer DEFAULT false NOT NULL,
	`cancel_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_by` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_by` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "appointments_period_check" CHECK("appointments"."ends_at" > "appointments"."starts_at"),
	CONSTRAINT "appointments_status_check" CHECK("appointments"."status" in ('agendado', 'confirmado', 'em_atendimento', 'atendido', 'faltou', 'cancelado')),
	CONSTRAINT "appointments_type_check" CHECK("appointments"."type" in ('primeira_consulta', 'consulta', 'retorno')),
	CONSTRAINT "appointments_cancel_check" CHECK("appointments"."status" <> 'cancelado' or "appointments"."cancel_reason" is not null)
);
--> statement-breakpoint
CREATE INDEX `appointments_doctor_start_idx` ON `appointments` (`doctor_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `appointments_patient_start_idx` ON `appointments` (`patient_id`,`starts_at`);--> statement-breakpoint
-- Guardrails (adicionados manualmente): consultas não são excluídas (use o status "cancelado")
-- e o histórico de cada consulta é somente de inclusão.
CREATE TRIGGER `appointments_no_delete` BEFORE DELETE ON `appointments`
BEGIN SELECT RAISE(ABORT, 'consultas nao podem ser excluidas: use o cancelamento'); END;--> statement-breakpoint
CREATE TRIGGER `appointment_events_no_update` BEFORE UPDATE ON `appointment_events`
BEGIN SELECT RAISE(ABORT, 'historico da consulta e somente de inclusao'); END;--> statement-breakpoint
CREATE TRIGGER `appointment_events_no_delete` BEFORE DELETE ON `appointment_events`
BEGIN SELECT RAISE(ABORT, 'historico da consulta e somente de inclusao'); END;