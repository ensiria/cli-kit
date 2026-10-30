#!/usr/bin/env node
/**
 * The `doctor` example: checks the tools and the project in the working folder and prints a report.
 *
 * @remarks
 * Shows `runChecks` (a live list on a terminal, silent in a pipe), `checkProgram` (a program's version against a
 * minimum), `reportChecks` (the report or its JSON, and the exit code: failure only when a check failed). The checks are
 * in `doctor.ts`. `node examples/doctor/doctor.mts --help` shows the options.
 *
 * @module
 */
import { reportChecks, runChecks } from "../../src/checks.ts";
import { defineScript } from "../../src/script.ts";
import { doctorChecks } from "./doctor.ts";

await defineScript({
  name: "doctor",
  command: "node examples/doctor/doctor.mts",
  summary: "Check the tools and the project in this folder.",
  icon: "check",
  json: true,
  examples: [
    {
      command: "doctor --json | jq '.[] | select(.status != \"ok\")'",
      description: "What is not fine, as data."
    }
  ],
  run: async ({ io, log, style, isJson, onExit }) => {
    reportChecks(await runChecks(doctorChecks(io), { io, log, onExit }), { io, style, isJson });
  }
}).run();
