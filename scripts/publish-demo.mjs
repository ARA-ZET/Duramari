#!/usr/bin/env node
/**
 * Publishes the sample budget to its single Firestore document, `demo/budget`.
 *
 *   node scripts/publish-demo.mjs [--project duramari]
 *
 * Client writes to that document are denied by the security rules, so this goes
 * through the REST API with a gcloud access token, which is checked against IAM
 * instead. Run it after editing `src/lib/demoSpec.mjs`; the app falls back to
 * the compiled-in copy if the document is missing, so this is a way to retune
 * the tour without a deploy rather than a step the app depends on.
 */

import { execFileSync } from "node:child_process";
import { buildDemoSpec } from "../src/lib/demoSpec.mjs";

const project = process.argv.includes("--project")
  ? process.argv[process.argv.indexOf("--project") + 1]
  : "duramari";

/** JS value -> Firestore's typed JSON, so the document stays structured and
 *  editable in the console rather than one opaque blob of JSON text. */
function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFields(value) } };
  throw new Error(`cannot encode ${typeof value}`);
}

function encodeFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = encode(v);
  }
  return fields;
}

const spec = buildDemoSpec();
const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();

const url =
  `https://firestore.googleapis.com/v1/projects/${project}` +
  `/databases/(default)/documents/demo/budget`;

const res = await fetch(url, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-goog-user-project": project,
  },
  body: JSON.stringify({
    fields: encodeFields({ ...spec, publishedAt: new Date().toISOString() }),
  }),
});

if (!res.ok) {
  console.error(`publish failed: ${res.status}\n${await res.text()}`);
  process.exit(1);
}

const months = new Set(spec.rows.map((r) => r.m)).size;
console.log(
  `published demo/budget to ${project}: ${spec.rows.length} rows across ${months} months, ` +
    `income R${spec.income.toLocaleString("en-ZA")}`,
);
