CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`iban` text,
	`description` text,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`auto_balance` integer DEFAULT true NOT NULL,
	`vat_kor` integer DEFAULT false NOT NULL,
	`csv_mapping` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`name` text NOT NULL,
	`purchase_date` text NOT NULL,
	`cost` integer NOT NULL,
	`residual_value` integer DEFAULT 0 NOT NULL,
	`useful_life_years` integer DEFAULT 5 NOT NULL,
	`kia_eligible` integer DEFAULT true NOT NULL,
	`disposed_date` text,
	`note` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `budget_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`category_id` integer,
	`name` text NOT NULL,
	`amount` integer NOT NULL,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`type` text DEFAULT 'fixed' NOT NULL,
	`start_month` text,
	`end_month` text,
	`note` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `budget_account_idx` ON `budget_lines` (`account_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`group_name` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text NOT NULL,
	`role` text,
	`vat_code` text,
	`tax_group` text,
	`deductible_pct` integer DEFAULT 100 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hours_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`hours` real NOT NULL,
	`description` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hours_account_date_idx` ON `hours_entries` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`filename` text NOT NULL,
	`format` text NOT NULL,
	`total_rows` integer NOT NULL,
	`inserted_rows` integer NOT NULL,
	`duplicate_rows` integer NOT NULL,
	`categorized_rows` integer NOT NULL,
	`date_from` text,
	`date_to` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer,
	`account_kind` text,
	`counterparty_contains` text,
	`description_contains` text,
	`counterparty_iban` text,
	`direction` text,
	`amount_min` integer,
	`amount_max` integer,
	`category_id` integer NOT NULL,
	`vat_code` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`times_applied` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rules_account_idx` ON `rules` (`account_id`);--> statement-breakpoint
CREATE TABLE `tax_years` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`year` integer NOT NULL,
	`is_starter` integer DEFAULT false NOT NULL,
	`hours_criterion` text DEFAULT 'auto' NOT NULL,
	`other_income` integer DEFAULT 0 NOT NULL,
	`prepaid_tax` integer DEFAULT 0 NOT NULL,
	`params` text,
	`notes` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_years_account_year_idx` ON `tax_years` (`account_id`,`year`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`counterparty_name` text,
	`counterparty_iban` text,
	`description` text DEFAULT '' NOT NULL,
	`tx_type` text,
	`external_id` text,
	`dedupe_key` text NOT NULL,
	`balance_after` integer,
	`category_id` integer,
	`category_source` text,
	`rule_id` integer,
	`vat_code` text,
	`vat_amount` integer,
	`tax_date` text,
	`note` text,
	`import_id` integer,
	`is_manual` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rule_id`) REFERENCES `rules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_dedupe_idx` ON `transactions` (`account_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `transactions_account_date_idx` ON `transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);