/**
 * The values a command line gives, checked by the schemas of their declarations (Standard Schema: zod, valibot,
 * arktype) before `run` receives them, typed.
 *
 * @remarks
 * Each option or positional with a `schema` has its value (each one, for a list) validated, async validators awaited;
 * what the schema gives replaces the value, so a schema may parse as it checks (`--body` read as JSON). Its issues are
 * a usage error naming the option or argument, each with its path inside the value. A value that is absent is not
 * checked.
 *
 * @module
 */
import { ArgumentError } from "./args.ts";
import type { ScriptOption, ScriptPositional } from "./help.types.ts";
import type { OptionValues, PositionalValues } from "./script.types.ts";
import type { StandardSchemaIssue, StandardSchemaV1 } from "./standardSchema.types.ts";

/** An issue as the usage error lists it: its path inside the value, then its message. */
const issueText = (issue: StandardSchemaIssue): string => {
  const path = (issue.path ?? []).map((segment) =>
    String(typeof segment === "object" ? segment.key : segment)
  );
  return path.length > 0 ? `${path.join(".")}: ${issue.message}` : issue.message;
};

/**
 * One value checked by a schema.
 *
 * @param label - The option or argument, for the message (`--body`, `<id>`).
 * @param schema - The validator.
 * @param value - The value given.
 * @returns What the schema gives.
 * @throws ArgumentError listing the issues.
 */
const checked = async (
  label: string,
  schema: StandardSchemaV1<string, unknown>,
  value: unknown
): Promise<unknown> => {
  const result = await schema["~standard"].validate(value);
  if (result.issues) throw new ArgumentError(`${label}: ${result.issues.map(issueText).join("; ")}`);
  return result.value;
};

/**
 * A value checked by its declaration's schema, each item of a list on its own; a value without a schema, or absent,
 * as it is.
 *
 * @param label - The option or argument.
 * @param schema - Its validator, if any.
 * @param value - Its value.
 */
const checkedValue = async (
  label: string,
  schema: StandardSchemaV1<string, unknown> | undefined,
  value: unknown
): Promise<unknown> => {
  if (schema === undefined || value === undefined) return value;
  if (Array.isArray(value)) return Promise.all(value.map((item: unknown) => checked(label, schema, item)));
  return checked(label, schema, value);
};

/**
 * The options and positionals of a run, checked by their schemas and typed as their declarations say.
 *
 * @param declaredOptions - The options whose values reach `run`.
 * @param options - Their values, by name.
 * @param declaredPositionals - The positionals.
 * @param args - Their values, by name.
 * @throws ArgumentError when a schema finds issues.
 */
export const checkedValues = async <
  TOptions extends Readonly<Record<string, ScriptOption>>,
  TPositionals extends readonly ScriptPositional[]
>(
  declaredOptions: Readonly<Record<string, ScriptOption>>,
  options: Readonly<Record<string, unknown>>,
  declaredPositionals: readonly ScriptPositional[],
  args: Readonly<Record<string, unknown>>
): Promise<{ readonly options: OptionValues<TOptions>; readonly args: PositionalValues<TPositionals> }> => {
  const optionEntries = await Promise.all(
    Object.entries(declaredOptions).map(
      async ([name, option]) => [name, await checkedValue(`--${name}`, option.schema, options[name])] as const
    )
  );
  const argEntries = await Promise.all(
    declaredPositionals.map(
      async (positional) =>
        [
          positional.name,
          await checkedValue(`<${positional.name}>`, positional.schema, args[positional.name])
        ] as const
    )
  );
  // built from the declarations, each value parsed, defaulted and checked by its schema, so their shapes are what
  // OptionValues<TOptions> and PositionalValues<TPositionals> describe
  return {
    options: Object.fromEntries(optionEntries) as OptionValues<TOptions>,
    args: Object.fromEntries(argEntries) as PositionalValues<TPositionals>
  };
};
