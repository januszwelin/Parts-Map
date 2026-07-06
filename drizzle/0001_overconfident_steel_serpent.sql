CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text,
	"count" integer,
	"last_request" bigint,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
