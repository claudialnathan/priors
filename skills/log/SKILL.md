---
description: Force-log a memory entry from the current context. With no argument, autonomously distill and stage candidates from the session — never ask the user to choose.
argument-hint: <claim text> | (empty for autonomous distillation)
---

The user wants to log: $ARGUMENTS

## Branch A — autonomous distillation (when `$ARGUMENTS` is empty)

If `$ARGUMENTS` is empty or whitespace-only, **do not ask the user which item to capture**. Asking re-introduces the human-bias loop this system is designed to remove. Commit to your reading of the session — the review queue under `.priors/staged/` is the safety net.

Run autonomous distillation inline:

1. **Scan the recent session** for durable observations with verifiable evidence: decisions actually made, constraints discovered (e.g. "tooling X enforces Y"), patterns confirmed across more than one occurrence, failures hit and rejected. Skip discussion that didn't produce a decision, emotional reactions, and one-off file edits.
2. **For each candidate, hold a quote.** A claim without a quotable line from the transcript or a file path + content is invalid — `stage_learning` runs quote-or-refuse and will reject it. Don't second-guess that gate.
3. **Write evidence and candidates to temp files**, then call `priors stage`:

   ```bash
   EVID=$(mktemp -t priors-evid.XXXXXX)
   CANDS=$(mktemp -t priors-cands.XXXXXX)

   # Source: a transcript-style block, one line per piece of evidence.
   cat > "$EVID" <<'EOF'
   <quoted line(s) from transcript or files supporting the candidates>
   EOF

   # Candidates: JSON array of { kind, claim, rationale, evidence: [{quote}] }.
   # Every quote must appear verbatim in $EVID — that's how quote-or-refuse passes.
   cat > "$CANDS" <<'EOF'
   [
     {
       "kind": "constraint",
       "claim": "<neutral durable claim>",
       "rationale": "<one-sentence why this matters to future work>",
       "evidence": [{ "quote": "<exact substring of $EVID>" }]
     }
   ]
   EOF

   node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js stage \
     --project-root "${CLAUDE_PROJECT_DIR:-$PWD}" \
     --source-kind transcript \
     --source-ref "session-$(date +%Y%m%d-%H%M%S)" \
     --source-content "@$EVID" \
     --candidates "@$CANDS"

   rm -f "$EVID" "$CANDS"
   ```

4. **Report what staged.** Show readable IDs (e.g. `D-007`) and one-line claims. If `stage_learning` refused a candidate, surface the reason once and move on — do not retry by reshaping the quote to game the gate.
5. **Do not commit.** Staged entries sit in the review queue. Curation is the user's call later via `/priors:rules` or direct file edit.

## Branch B — direct user-authored write (when `$ARGUMENTS` has a claim)

1. **Translate, do not copy.** If `$ARGUMENTS` reads like raw user voice ("ugh, this thing is annoying"), rewrite the claim in neutral, durable form (e.g. "X is unreliable when Y; prefer Z"). Preserve the original phrase as evidence in the rationale.
2. **Pick a kind.** decision | failure | constraint | pattern | question | rule. Default to `decision` if unsure.
3. **Confirm with the user only if the rewrite changes meaning.** Otherwise just log.

Then run:

```
node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js log "<neutral claim>" \
  --project-root "${CLAUDE_PROJECT_DIR:-$PWD}" \
  --kind <kind> \
  --user-text "$ARGUMENTS" \
  --rationale "<one-sentence why>"
```

Present the result with the readable id (e.g. `D-007`) and the final claim.
