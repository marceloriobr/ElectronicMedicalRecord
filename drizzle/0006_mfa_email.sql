CREATE TABLE `mfa_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sends` integer DEFAULT 1 NOT NULL,
	`last_sent_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mfa_challenges_user_idx` ON `mfa_challenges` (`user_id`);