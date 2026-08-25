import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import { Tool } from "effect/unstable/ai";

import { PreviewMidsceneToolkit } from "./tools.ts";

const schemaHasDescription = (schema: unknown): boolean => {
  if (!schema || typeof schema !== "object") return false;
  const record = schema as Record<string, unknown>;
  if (typeof record.description === "string" && record.description.length > 0) return true;
  return [record.anyOf, record.oneOf, record.allOf]
    .filter(Array.isArray)
    .some((members) => members.some(schemaHasDescription));
};

it("exports provider-compatible schemas with explicit browser annotations", () => {
  const expectedAnnotations = {
    preview_midscene_act: {
      readonly: false,
      destructive: true,
      idempotent: false,
    },
    preview_midscene_query: {
      readonly: true,
      destructive: false,
      idempotent: true,
    },
    preview_midscene_assert: {
      readonly: true,
      destructive: false,
      idempotent: true,
    },
  } as const;

  for (const tool of Object.values(PreviewMidsceneToolkit.tools)) {
    const schema = Tool.getJsonSchema(tool) as {
      readonly type?: unknown;
      readonly properties?: Readonly<Record<string, unknown>>;
      readonly anyOf?: unknown;
      readonly oneOf?: unknown;
    };
    const expected = expectedAnnotations[tool.name];

    expect(tool.description?.length ?? 0).toBeGreaterThan(80);
    expect(schema.type).toBe("object");
    expect(schema.anyOf).toBeUndefined();
    expect(schema.oneOf).toBeUndefined();
    expect(schema.properties?.tabId).toBeDefined();
    for (const [field, fieldSchema] of Object.entries(schema.properties ?? {})) {
      expect(schemaHasDescription(fieldSchema), `${tool.name}.${field} needs a description`).toBe(
        true,
      );
    }

    expect(Context.get(tool.annotations, Tool.OpenWorld)).toBe(true);
    expect(Context.get(tool.annotations, Tool.Readonly)).toBe(expected.readonly);
    expect(Context.get(tool.annotations, Tool.Destructive)).toBe(expected.destructive);
    expect(Context.get(tool.annotations, Tool.Idempotent)).toBe(expected.idempotent);
  }
});
