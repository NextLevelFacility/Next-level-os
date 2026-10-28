// The default 30/60/90 plan, built on the 5 C's. Every new hire gets these tasks created automatically.
// c: compliance | clarity | culture | connection | checkback  (connection = shadowing every seat)
export const DEFAULT_PLAN = [
  // Compliance — before Day 1 (owner: operator)
  { phase: 'compliance', c: 'compliance', owner: 'operator', text: 'Offer letter signed, pay and schedule confirmed' },
  { phase: 'compliance', c: 'compliance', owner: 'operator', text: 'NDA and non-solicit signed' },
  { phase: 'compliance', c: 'compliance', owner: 'operator', text: 'W-4 / I-9 or contractor agreement' },
  { phase: 'compliance', c: 'compliance', owner: 'operator', text: 'Payroll set up in QuickBooks' },
  { phase: 'compliance', c: 'compliance', owner: 'operator', text: 'Logins created: Next Level OS, PushPress, GoHighLevel, ADP coach PIN, team chat' },
  { phase: 'compliance', c: 'compliance', owner: 'operator', text: 'Next Level gear in their size ready for Day 1' },
  { phase: 'compliance', c: 'clarity', owner: 'manager', text: 'Write the three problems this hire is here to solve' },

  // Week 1 — learn the system
  { phase: 'week1', c: 'culture', owner: 'hire', text: 'Day 1: tour, gear, meet the team' },
  { phase: 'week1', c: 'culture', owner: 'hire', text: 'Read Core Beliefs (all eight)' },
  { phase: 'week1', c: 'culture', owner: 'hire', text: 'Read The Next Level Standard' },
  { phase: 'week1', c: 'culture', owner: 'hire', text: 'Read Culture Code and Brand Story' },
  { phase: 'week1', c: 'culture', owner: 'hire', text: 'Watch the coaching methodology videos (coaches)' },
  { phase: 'week1', c: 'clarity', owner: 'hire', text: 'Read every SOP for your role in the Playbook and mark each one read' },
  { phase: 'week1', c: 'connection', owner: 'hire', text: 'Shadow: front desk' },
  { phase: 'week1', c: 'connection', owner: 'hire', text: 'Shadow: concessions' },
  { phase: 'week1', c: 'connection', owner: 'hire', text: 'Shadow: one coaching session' },
  { phase: 'week1', c: 'connection', owner: 'hire', text: 'Shadow: one sales evaluation' },
  { phase: 'week1', c: 'culture', owner: 'owner', text: 'Culture conversation with Gabriel: "Which belief is hardest for you? Which is easiest?"' },
  { phase: 'week1', c: 'checkback', owner: 'manager', text: 'Two 15-minute check-ins every day (morning: plan, afternoon: what got stuck)' },

  // Week 2 — do it with supervision
  { phase: 'week2', c: 'clarity', owner: 'hire', text: 'Run your role with your manager watching' },
  { phase: 'week2', c: 'connection', owner: 'hire', text: 'Shadow Vittorio or Simon on an evaluation' },
  { phase: 'week2', c: 'clarity', owner: 'hire', text: 'First scorecard numbers logged' },
  { phase: 'week2', c: 'checkback', owner: 'manager', text: 'Two check-ins every day' },

  // Week 3 — do it alone, reviewed daily
  { phase: 'week3', c: 'clarity', owner: 'hire', text: 'Run your role unsupervised' },
  { phase: 'week3', c: 'clarity', owner: 'manager', text: 'Standards check: audit against The Next Level Standard' },
  { phase: 'week3', c: 'checkback', owner: 'manager', text: 'One check-in every day' },

  // Week 4 — prove it
  { phase: 'week4', c: 'clarity', owner: 'hire', text: 'Hit Week-4 scorecard targets' },
  { phase: 'week4', c: 'clarity', owner: 'hire', text: 'Name one SOP that was wrong or missing, and fix it' },
  { phase: 'week4', c: 'checkback', owner: 'manager', text: 'Day 30 review: go / no-go and the 60-day problems' },

  // Day 60 — own it
  { phase: 'day60', c: 'clarity', owner: 'hire', text: 'Runs role with no check-ins needed' },
  { phase: 'day60', c: 'clarity', owner: 'hire', text: 'Owns scorecard; reports numbers weekly without being asked' },
  { phase: 'day60', c: 'checkback', owner: 'manager', text: 'Day 60 review' },

  // Day 90 — improve it
  { phase: 'day90', c: 'clarity', owner: 'hire', text: 'One number moved' },
  { phase: 'day90', c: 'clarity', owner: 'hire', text: 'One SOP rewritten and approved' },
  { phase: 'day90', c: 'checkback', owner: 'manager', text: 'Day 90 review: permanent seat confirmed' },
].map((t, i) => ({ ...t, sort: i }))

export const PHASES = [
  ['compliance', 'Before Day 1 · Compliance'],
  ['week1', 'Week 1 · Learn the system'],
  ['week2', 'Week 2 · Do it with supervision'],
  ['week3', 'Week 3 · Do it alone'],
  ['week4', 'Week 4 · Prove it'],
  ['day60', 'Day 60 · Own it'],
  ['day90', 'Day 90 · Improve it'],
]

export const C_LABEL = { compliance: 'Compliance', clarity: 'Clarity', culture: 'Culture', connection: 'Connection', checkback: 'Check-back' }
