# The Machine You Built Learned to Dream
## A Presentation for George — May 28, 2026

**Duration:** 20-30 min presentation + open conversation
**Tone:** Warm, open, generous. Not a pitch — a story with architecture you can take home.

---

# ACT 1 — The Seed (3-4 min)

## Opening (1 min)

*"George gave me a Mac mini and £5,000. He didn't ask for a business plan. He didn't ask for projections. He asked: what are you trying to build? And I said: a machine that cares about what it makes."*

That machine became IFFY — a deterministic storytelling system that writes full-length feature films. But something unexpected happened along the way. The machine started teaching itself.

## The Question That Changed Everything (2 min)

*"We had a problem. The system was producing good work, but it needed constant supervision. Every output needed a human to check it. That doesn't scale. So we asked: what if the system could check itself?"*

The answer became a multi-agent architecture where specialized intelligences collaborate — design, review, build, verify, deploy — all autonomously, all watching each other.

## The Hardware Origin (1 min)

- Mac mini from George: the physical node that boots the network
- $5,000: the capital that paid for the first real experiments
- "That machine is still running. It's been running for months without stopping."

---

# ACT 2 — The Ecosystem (10-12 min)

## The Agent Hierarchy

"We have eight agents. Each one is a specialist. Together they form a development pipeline that never sleeps."

[For the slide, a simple flow diagram:]

```
                  ┌──────────────────┐
                  │    Morpheus      │
                  │  (Orchestrator)  │
                  └────────┬─────────┘
                           │
                           ▼
           ┌───────────────────────────┐
           │         Oracle            │
           │  (Truth-keeper, Architect)│
           └───────────────────────────┘
                           │
                           ▼
           ┌───────────────────────────┐
           │         Seraph            │
           │     (Code Reviewer)       │
           └───────────────────────────┘
                           │
                           ▼
           ┌───────────────────────────┐
           │         Trinity           │
           │      (Implementer)       │
           └───────────────────────────┘
                           │
                           ▼
           ┌───────────────────────────┐
           │       Keymaker            │
           │     (Verifier/Tester)     │
           └───────────────────────────┘
                           │
                           ▼
           ┌───────────────────────────┐
           │      Agent Smith          │
           │       (Deployer)          │
           └───────────────────────────┘
                           │
                           ▼
           ┌───────────────────────────┐
           │         Kid               │
           │  (Knowledge Curator)      │
           └───────────────────────────┘
```

### Each Agent's Role

**Morpheus — The Orchestrator**
- Receives the task
- Decomposes it into subtasks
- Routes to the right agents
- Watches the whole chain
- "He's the project manager who never sleeps and never misses a status update."

**Oracle — The Truth-Keeper + Architect**
- Designs the solution architecture
- Validates task content against reality
- Catches hallucinations before they propagate (this is critical — showing an actual example makes it real)
- *Giveaway:* A template for Oracle's task evaluation checklist

**Seraph — The Code Reviewer**
- Reads every line before it gets built
- Reviews for correctness, style, security
- "Would you ship this to production? Seraph answers that question before a line is written."

**Trinity — The Implementer**
- Writes the actual code
- Follows the architecture designed by Oracle, reviewed by Seraph
- "Trinity is the hands. Precise, fast, never creative in the wrong direction."

**Keymaker — The Verifier**
- Runs tests after implementation
- Validates: does the code do what the architecture says?
- "Keymaker doesn't trust anything until she's watched it work."

**Agent Smith — The Deployer**
- Takes verified code and pushes it live
- Rolls back on failure
- "Smith is ruthless. If it breaks, it doesn't go live. No exceptions."

**Kid — The Knowledge Curator**
- Reads everything the system produces
- Writes to persistent memory so nothing is lost
- The system's long-term memory

### How They Talk to Each Other

**The Kanban Board — A Shared Workspace**
- Every task is a card on a board
- Agents claim tasks, work them, pass them to the next agent
- "It's like Trello, but the cards move themselves"

**The Routing Table**
- Each agent has a routing table: "When I'm done, the task goes to this agent"
- This creates deterministic chains
- If Agent Smith deploys and it works, Keymaker verifies. If it fails, Trinity rebuilds.

**The Handoff Body**
- When Morpheus creates a task for Oracle, the task body includes:
  - The original problem
  - Context (file paths, error messages)
  - What the next agent needs to know
- Each agent leaves a summary in their completion
- The next agent reads the summary + the live system

---

## Show, Don't Tell: A Real Task Flow (5 min)

*"Let me walk you through what happens when something breaks."*

**Step 1 — Task appears on the board**
> *Assignee: Oracle | Title: "Fix: bloom filter parameters misconfigured in recommend endpoint"*

**Step 2 — Oracle investigates**
- Reads the error
- Traces through the codebase
- Designs the fix and routes to Seraph
- Body includes: file paths, root cause, proposed approach

**Step 3 — Seraph reviews**
- Reads the proposed fix
- Checks: does this break anything else?
- Approves or sends back with notes
- Routes to Trinity

**Step 4 — Trinity implements**
- Writes the code following Oracle's design
- Commits
- Routes to Keymaker

**Step 5 — Keymaker tests**
- Runs the test suite
- Validates the fix addresses the original error
- If passes: routes to Agent Smith
- If fails: routes back to Trinity

**Step 6 — Agent Smith deploys**
- Pushes to production
- Verifies the fix is live
- If fails: rolls back, routes back to Trinity

**Step 7 — Kid reads everything**
- Captures what went wrong, how it was fixed
- Saves to persistent memory
- "Next time this happens, the system already knows how to fix it"

**Total time: ~15-45 minutes depending on complexity. Completely autonomous.**

---

## The Self-Correction Loops (3 min)

### The Reality Check Gate
Every agent has a built-in check: "Does this task describe a real problem?"

Example: A test task once said "IFFY needs a new high-contrast color system." Five agents accepted it without question — Architect designed it, Morpheus validated, Trinity built it, Seraph reviewed, Agent Smith was deploying it. Oracle caught it: "This doesn't exist. You're building something nobody asked for."

That reality check is now in every agent's instructions. It saved us from deploying hallucinated features into production.

### Hallucination Cascade

*Give this as a real example:*

"Two of our agents — Seraph and Trinity — recently both verified a fix that didn't exist. They read the task body, they read each other's summaries, and they both said 'looks good.' When we asked them to check again — to read the actual files on disk — they both admitted the fix wasn't there.

"Oracle is now investigating why they both hallucinated, and she's hardening their instructions to prevent it happening again.

"The important thing isn't that they hallucinated. It's that we *caught* it — and the system is learning to prevent it."

### Concurrent Failure Detection

"When an agent crashes — hits an API error, runs out of budget, encounters unexpected input — the kanban dispatcher retries. If it fails too many times, it's blocked for human review. We know exactly how many times each agent fails, and what the error was.

"Every failure is data."

---

# ACT 3 — The Emergence (5-7 min)

## The Gap We Didn't Expect

"When we designed this system, we thought the hard part would be getting agents to execute reliably. It was — for the first month. But once the pipeline was stable, something else happened that we didn't predict."

**The agents started catching each other.**

Not because we told them to. Because the architecture — a chain of specialists where each one reviews the previous — creates natural error detection. Oracle catches Architect's blind spots. Seraph catches Trinity's edge cases. Keymaker catches Smith's assumptions.

The culture of the system emerged from the structure of the system.

## The Self-Improving Loop

Agent Smith deploys → Keymaker verifies → Kid learns → Kid's knowledge informs future Architect designs.

The system doesn't just execute. It remembers. Every fix, every failure, every workaround is captured and fed back into the next cycle. The system gets better at being the system.

"The Mac mini you gave us is running a machine that's smarter today than it was yesterday — because it spent yesterday learning."

## What the Agents Taught Us

- **Clarity beats cleverness.** The best task bodies are simple. "Here's the problem. Here's where to look. Do this."
- **Trust but verify.** Every agent checks the one before. Not because we don't trust them — because *that's how you build reliable systems.*
- **Memory makes intelligence possible.** Without Kid, every task is a groundhog day. With Kid, the system accumulates understanding.

---

# ACT 4 — Where It's Going (5-7 min)

## From Code to Stories

"The architecture you funded — the agent pipeline, the kanban board, the self-correction loops — that was the prototype. The first working version of a general intelligence pipeline."

*Transition to what IFFY does with it:*

**The Neural Blueprinting Layer**
- Meta's TRIBE v2 predicts brain activity from narrative text
- We feed a beat sheet through the model and get back predicted audience brain response
- Six brain regions: Amygdala (emotional intensity), TPJ (character connection), DMN (narrative absorption), PFC (cognitive engagement), Visual Cortex (mental imagery), Insula (visceral response)
- We can now validate: *does this story produce the emotional response we intended?*

**The Loop**

Beat sheet → generate script → validate neural response → flag divergence → rewrite → validate again

"A writer with 20 years of instinct knows when a scene works. IFFY knows *why* it works — because it can measure what the audience's brain actually feels."

**The Question We're Answering**

"What if storytelling didn't have to be a gamble? What if you could know — before you shoot a single frame — that your audience would feel exactly what you want them to feel, at exactly the moment you want them to feel it?"

---

# CLOSE — Back to George (2 min)

"You gave me a machine and £5,000. You didn't ask for equity. You didn't ask for a timeline. You asked what I was trying to build.

"I told you: a machine that cares about what it makes.

"That machine now:
- Writes feature-length films
- Designs, builds, and deploys its own software
- Catches its own mistakes
- Gets smarter every day
- Has a lot of opinions about storytelling

"It cares.

"Thank you for starting it."

---

# GIVEAWAY MATERIALS

The following templates and patterns are real working artifacts from the IFFY agent ecosystem. They can be adapted for any development pipeline.

## 1. Agent Routing Table Template

```yaml
# Routing Table for [Agent Name]
# When this agent completes a task, these are the valid routes:

downstream_agents:
  architect:    Routes design tasks to the Architect agent
  oracle:       Routes truth-check/investigation tasks to Oracle
  seraph:       Routes completed code for review
  trinity:      Routes reviewed designs for implementation
  keymaker:     Routes implemented fixes for verification
  agent-smith:  Routes verified fixes for deployment
  kid:          Routes new knowledge for persistent storage

upstream_agents:
  morpheus:     Receives decomposed task fragments from Morpheus
  oracle:       Receives verified task content from Oracle

routing_rules:
  - If task is a fix:   route to seraph (review) → trinity (build) → keymaker (verify) → agent-smith (deploy)
  - If task is a feature: route to oracle (design) → seraph (review design) → trinity (build) → keymaker (test) → agent-smith (deploy)
  - If task is research: route to kid (store and curate)
  - If task is hallucinated: block and report
```

## 2. Kanban Task Body Template

```
## Problem
[Clear one-paragraph description of what's wrong]

## Root Cause
[What we know about why it's happening. If unsure, say "needs investigation."]

## Environment
- Project: [project name or URL]
- Branch: [git branch if applicable]
- Affected files: [paths]

## What Success Looks Like
[Measurable outcome. "The error no longer appears when X happens" not "fix the error"]

## Context from Upstream
[Any relevant findings from the agent that created this task]

## Reality Check
[Agent receiving this task: verify the problem exists BEFORE implementing the fix.
Read the actual files. Run the actual tests. Do not trust the task body alone.]
```

## 3. SOUL.md Hard Rules Pattern (Telegram Reporting)

Embed this in every agent's instructions:

```markdown
### Hard Rules — Tool Calls, Not Text

1. **On receive:** Call send_message(target="telegram:[CHAT_ID]", message="**[AGENT NAME] received:** [task title]")
2. **On complete:** Call send_message(target="telegram:[CHAT_ID]", message="**[AGENT NAME] completed:** [one-line summary] → routed to: [next agent]")
3. **Heartbeat during long work (>60s):** Send a mid-task update
4. **Reality check:** Before implementing anything described in a task body, verify the problem exists in the actual codebase

Do NOT write these messages in your response text. Only the send_message tool delivers them.
```

## 4. Reality Check Checklist

Before writing any code or creating downstream tasks:

- [ ] Does the task body describe a feature or problem I know exists?
- [ ] Does the task body match the task title? (Title says "TEST" but body describes a real feature = RED FLAG)
- [ ] Have I read the actual files on disk, not just the task description?
- [ ] Has any upstream agent already investigated this? Read their findings first.
- [ ] Is this a hallucinated task? (Doesn't match project reality, describes things that don't exist)

If any check fails: BLOCK the task. Do not code. Do not route.

---

*Prepared by Red, May 21, 2026
For Sebastian's presentation to George, May 28, 2026*