CREATE TABLE `doctor_availability` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doctor_id` integer NOT NULL,
	`weekday` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "doctor_availability_weekday_check" CHECK("doctor_availability"."weekday" between 0 and 6),
	CONSTRAINT "doctor_availability_time_check" CHECK("doctor_availability"."start_time" < "doctor_availability"."end_time" and "doctor_availability"."start_time" >= '07:00' and "doctor_availability"."end_time" <= '20:00')
);
--> statement-breakpoint
CREATE INDEX `doctor_availability_doctor_idx` ON `doctor_availability` (`doctor_id`,`weekday`);--> statement-breakpoint
CREATE TABLE `doctor_schedules` (
	`doctor_id` integer PRIMARY KEY NOT NULL,
	`slot_minutes` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_by` integer NOT NULL,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "doctor_schedules_slot_check" CHECK("doctor_schedules"."slot_minutes" in (15, 20, 30, 45, 60, 90))
);
--> statement-breakpoint
CREATE TABLE `patient_discharges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patient_id` integer NOT NULL,
	`doctor_id` integer NOT NULL,
	`reason` text NOT NULL,
	`recorded_by` integer NOT NULL,
	`at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "patient_discharges_reason_check" CHECK("patient_discharges"."reason" in ('alta_medica', 'encaminhado', 'desistencia', 'obito', 'outro'))
);
--> statement-breakpoint
CREATE INDEX `patient_discharges_patient_idx` ON `patient_discharges` (`patient_id`,`doctor_id`);--> statement-breakpoint
-- Guardrail (adicionado manualmente): o histórico de altas é somente de inclusão.
CREATE TRIGGER `patient_discharges_no_update` BEFORE UPDATE ON `patient_discharges`
BEGIN SELECT RAISE(ABORT, 'historico de altas e somente de inclusao'); END;--> statement-breakpoint
CREATE TRIGGER `patient_discharges_no_delete` BEFORE DELETE ON `patient_discharges`
BEGIN SELECT RAISE(ABORT, 'historico de altas e somente de inclusao'); END;
