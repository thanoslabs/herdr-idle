// Expectations that are about to change, each in one place, so a change of
// rule is a change here (and the tests that use it follow):
//
// - Where a failed attempt sends the party (failStage in rules.js): since
//   fix/idle-pause, back to at most best - 1, and a failure at or below that
//   stage repeats it, farming (with nothing cleared yet, best 1, stage 1 is
//   simply tried again). Before it: one stage back ("one-back").
// - What the stage section says (stageSection in main.js): since
//   fix/idle-pause, "(PAUSED)" beside the time while nobody attacks a living
//   boss (PAUSED_LABEL; null before).

export const DROP_RULE = "best-1"; // "one-back" before fix/idle-pause; "best-1" since

// { stage, farming } after an attempt at `stage` fails, with `best` reached.
export function afterFail(stage, best) {
  if (DROP_RULE === "best-1") {
    const to = Math.max(1, Math.min(stage, best - 1));
    return { stage: to, farming: best > 1 ? true : null /* unchanged */ };
  }
  return stage > 1 ? { stage: stage - 1, farming: true } : { stage: 1, farming: null /* unchanged */ };
}

export const PAUSED_LABEL = "(PAUSED)"; // null before fix/idle-pause

// The stage section's text (v.text("idle-rpg-stage")), in drawing order.
// `clock` is the time shown ("9:42"; "" while the boss is down), `running`
// whether anyone attacks a living boss.
export function stageTexts({ stage, farming = false, clock, running = true }) {
  const out = [`STAGE ${stage}`];
  if (farming) out.push("FARM");
  if (PAUSED_LABEL && !running && clock) out.push(PAUSED_LABEL);
  if (clock) out.push(clock);
  return out;
}
