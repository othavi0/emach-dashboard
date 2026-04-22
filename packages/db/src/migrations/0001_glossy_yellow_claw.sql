ALTER TABLE "tool" DROP CONSTRAINT "tool_invoice_model_unique";--> statement-breakpoint
CREATE INDEX "tool_invoice_model_idx" ON "tool" USING btree ("invoice_model");