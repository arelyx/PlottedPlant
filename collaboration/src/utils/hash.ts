import { createHash } from "crypto";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}
