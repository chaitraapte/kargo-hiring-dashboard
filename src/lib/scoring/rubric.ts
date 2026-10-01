import "server-only";
import { readFileSync } from "fs";
import path from "path";

let cached: string | null = null;

export function getRubricText(): string {
  if (!cached) {
    cached = readFileSync(path.join(process.cwd(), "rubric", "kargo_hiring_rubric.txt"), "utf8");
  }
  return cached;
}
