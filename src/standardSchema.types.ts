/**
 * The Standard Schema interface (version 1, standardschema.dev), as types only: what a validator implements so the
 * kit can check an option's value with it (zod 4, valibot and arktype do) without depending on any of them.
 *
 * @remarks
 * The same shape as the specification's, written as flat types instead of a namespace: TypeScript compares them by
 * their structure, so any validator that implements the standard fits. Only what the kit uses is here: `validate`,
 * its result and its issues, and the inferred types.
 *
 * @module
 */

/** A path segment of an issue, when the library writes it as an object. */
export interface StandardSchemaPathSegment {
  /** The key of the segment. */
  readonly key: PropertyKey;
}

/** One problem a validator found. */
export interface StandardSchemaIssue {
  /** What is wrong. */
  readonly message: string;
  /** Where, inside a structured value. */
  readonly path?: readonly (PropertyKey | StandardSchemaPathSegment)[] | undefined;
}

/** What a validation gives: the value, or its issues. */
export type StandardSchemaResult<TOutput> =
  | {
      /** The checked (and possibly transformed) value. */
      readonly value: TOutput;
      /** No issues. */
      readonly issues?: undefined;
    }
  | {
      /** The problems found. */
      readonly issues: readonly StandardSchemaIssue[];
    };

/** A validator, as the Standard Schema interface describes it. */
export interface StandardSchemaV1<TInput = unknown, TOutput = TInput> {
  /** The standard's properties. */
  readonly "~standard": {
    /** The standard's version. */
    readonly version: 1;
    /** The library that made the validator. */
    readonly vendor: string;
    /** Checks a value; may be async. */
    readonly validate: (
      value: unknown
    ) => StandardSchemaResult<TOutput> | Promise<StandardSchemaResult<TOutput>>;
    /** The input and output types, for inference only. */
    readonly types?: { readonly input: TInput; readonly output: TOutput } | undefined;
  };
}

/** What a validator gives when it passes. */
export type StandardSchemaOutput<TSchema extends StandardSchemaV1> = NonNullable<
  TSchema["~standard"]["types"]
>["output"];
