ALTER TABLE `doctor_schedules` ADD `price_first_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `doctor_schedules` ADD `price_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `doctor_schedules` ADD `price_return_cents` integer DEFAULT 0 NOT NULL;