import { z } from "zod";

import { refundRequestSchema, requestFieldSchema, requestViewSchema } from "./schemas.js";

const visibleFieldsSchema = z.array(requestFieldSchema).min(1).refine(
  (fields) => new Set(fields).size === fields.length,
  { message: "Visible request fields must be unique." },
);

export function deriveAgentView(input, visibleFieldInput) {
  const request = refundRequestSchema.parse(input);
  const visibleFields = visibleFieldsSchema.parse(visibleFieldInput);
  const view = Object.fromEntries(visibleFields.map((field) => [field, structuredClone(request[field])]));
  return Object.freeze(requestViewSchema.parse(view));
}
