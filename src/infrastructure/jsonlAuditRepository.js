import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { decisionRecordSchema } from "../domain/schemas.js";

export function createJsonlAuditRepository({ outputPath }) {
  if (!outputPath) throw new TypeError("outputPath is required");
  return Object.freeze({
    async append(input) {
      const record = decisionRecordSchema.parse(input);
      await mkdir(dirname(outputPath), { recursive: true });
      await appendFile(outputPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    },
  });
}
