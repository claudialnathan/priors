/**
 * JSON Schema documents for the v1 MCP tool surface. Every object schema
 * MUST set `additionalProperties: false`. Validation against these schemas
 * happens in the MCP handlers; the schemas themselves are advertised to
 * clients so they can produce well-formed calls.
 */

export const ENTRY_ID_PATTERN = "^[a-z0-9][a-z0-9-]{0,127}$";

export const TOOL_SCHEMAS = {
  recall: {
    description:
      "Plain-text search over the index. Filters narrow by kind/status/confidence/date/relation. No embeddings in v1.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", maxLength: 500 },
        kind: {
          type: "string",
          enum: [
            "decision",
            "failure",
            "constraint",
            "pattern",
            "question",
            "hypothesis",
          ],
        },
        status: {
          type: "string",
          enum: [
            "active",
            "stale",
            "superseded",
            "contested",
            "action_pending",
          ],
        },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
        },
        as_of_after: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        as_of_before: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        relation: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: {
              type: "string",
              enum: [
                "supersedes",
                "contradicts",
                "reinforces",
                "derived_from",
              ],
            },
            direction: {
              type: "string",
              enum: ["from", "to"],
            },
            target: { type: "string", pattern: ENTRY_ID_PATTERN },
          },
          required: ["kind", "direction", "target"],
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: [],
    },
  },

  get_entry: {
    description: "Fetch the full body and frontmatter of an entry.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", pattern: ENTRY_ID_PATTERN },
      },
      required: ["id"],
    },
  },

  stage_learning: {
    description:
      "Verify candidate lessons against source content via verbatim quote substring matching, then write verified candidates to staged/. If candidates is omitted, returns the conservative-archivist system prompt rendered with the source.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        source_kind: {
          type: "string",
          enum: ["transcript", "tool_trace", "session_log", "manual_text"],
        },
        source_ref: { type: "string", maxLength: 500 },
        source_content: { type: "string", maxLength: 200_000 },
        project_id: { type: "string" },
        candidates: { type: "array", items: { type: "object" }, maxItems: 5 },
        existing_entries: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string", pattern: ENTRY_ID_PATTERN },
              claim: { type: "string", maxLength: 280 },
            },
            required: ["id", "claim"],
          },
        },
        prompt_context: { type: "string", maxLength: 2000 },
        client_request_id: { type: "string", maxLength: 200 },
      },
      required: ["source_kind", "source_ref", "source_content", "project_id"],
    },
  },

  commit_learning: {
    description: "Promote a staged entry to active. Updates indexes; appends audit.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        staged_id: { type: "string", pattern: ENTRY_ID_PATTERN },
        client_request_id: { type: "string", maxLength: 200 },
      },
      required: ["staged_id"],
    },
  },

  mark_stale: {
    description:
      "Soft state change. Distinct from `superseded`. Surfaces in recall(status: stale).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", pattern: ENTRY_ID_PATTERN },
        reason: { type: "string", minLength: 1, maxLength: 500 },
        client_request_id: { type: "string", maxLength: 200 },
      },
      required: ["id", "reason"],
    },
  },

  link_entries: {
    description:
      "Add a relation between two entries. Rejects self-links and supersedes cycles. A contradicts link sets both entries to status: contested.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        source_id: { type: "string", pattern: ENTRY_ID_PATTERN },
        relation: {
          type: "string",
          enum: ["supersedes", "contradicts", "reinforces", "derived_from"],
        },
        target_id: { type: "string", pattern: ENTRY_ID_PATTERN },
        client_request_id: { type: "string", maxLength: 200 },
      },
      required: ["source_id", "relation", "target_id"],
    },
  },
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

export const RESOURCE_URIS = {
  brief: "priors://brief",
  index: "priors://index",
  entryPrefix: "priors://entry/",
  auditPrefix: "priors://audit/",
} as const;

export const PROMPT_DEFS = {
  priors_distill: {
    description:
      "Render the conservative-archivist system prompt for distilling source content into staged candidates. The agent producing candidates must call stage_learning to verify them.",
    arguments: [
      {
        name: "source_kind",
        description: "transcript | tool_trace | session_log | manual_text",
        required: true,
      },
      {
        name: "source_ref",
        description: "Stable identifier for the source (file path, session id, etc.).",
        required: true,
      },
      {
        name: "source_content",
        description: "The full text of the source.",
        required: true,
      },
      {
        name: "project_id",
        description: "The project's UUID, from priors://index or .priors/project.json.",
        required: false,
      },
    ],
  },
} as const;
