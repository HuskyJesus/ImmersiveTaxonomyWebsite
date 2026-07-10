/* ============================================================
   STARTER CONTENT — default taxonomy with editable descriptions
   ============================================================

   Everything in this file is EDITABLE STARTER CONTENT: clear,
   professional placeholder text, not final academic definitions.
   Administrators can rewrite any of it directly on the site
   (Edit Mode → ✎ beside a column name or inside a cell), or you
   can edit this file to change what "Reset to Default" restores
   and what brand-new visitors see before anything is published.

   Structure:
     DEFAULT_COLUMNS  — the ten design dimensions + descriptions
     DEFAULT_ROWS     — the grid of value names (spelling preserved
                        exactly as provided, e.g. "Sythensis")
     VALUE_STARTERS   — per-value descriptions, keyed by column id
                        then value text
     buildDefaultTaxonomy() — assembles the schema-v3 object with
                        stable ids on every column AND every value
   ============================================================ */

export const DEFAULT_COLUMNS = [
  {
    id: "interactivity",
    name: "Interactivity",
    shortDescription: "How much, and in what way, participants can act within the experience.",
    detailedDescription: "Interactivity ranges from purely watching to solving problems, moving physically, or engaging other people. It sets the baseline for what a participant is invited — or required — to do, and every other design choice tends to build on it.",
    example: "A museum exhibit is Passive when visitors only view it; it becomes Problem Solving when visitors must decode a cipher to open the next room."
  },
  {
    id: "embodiment",
    name: "Embodiment",
    shortDescription: "How present participants feel inside the experience — where their body and point of view sit.",
    detailedDescription: "Embodiment describes the participant's relationship to the world: watching it from outside, standing invisibly within it, seeing through their own eyes, having their movement mirrored, or being met by real humans. Stronger embodiment usually means stronger immersion — and higher design stakes.",
    example: "The same battlefield scene feels documentary-like from a Detached view, and overwhelming in First Person POV as musket fire passes overhead."
  },
  {
    id: "co-participation",
    name: "Co-Participation",
    shortDescription: "The social structure — how many people share the experience and how they relate.",
    detailedDescription: "Co-Participation covers everything from a solo session to intimate one-on-one encounters, small groups, massive shared worlds, and asymmetric setups where some people act while others watch and influence. It determines whether meaning comes from private reflection or shared negotiation.",
    example: "An escape room is a Group experience; the same puzzles reworked as a play-by-post with an audience voting on hints becomes Secondary Perspective."
  },
  {
    id: "story",
    name: "Story",
    shortDescription: "How narrative is structured — from none at all to a story that adapts around the participant.",
    detailedDescription: "Story sets the narrative spine: an experience can rely on pure activity with no plot, imply a story through its setting, deliver a fixed authored narrative, branch on participant choices, or continuously reshape itself. More narrative flexibility generally trades authorial control for participant ownership.",
    example: "A cooking class has no story; a themed dinner where each course reveals a chapter of a chef's journey uses a Pre-created narrative."
  },
  {
    id: "dynamics",
    name: "Dynamics",
    shortDescription: "How much agency participants have and how the system responds to what they do.",
    detailedDescription: "Dynamics describes the rules of cause and effect: events may run on rails, pause at decision points, respond to free action, negotiate through open dialogue, or let participants shift their point of view on the system itself. It is the dimension participants feel most directly, moment to moment.",
    example: "A haunted house is Predetermined — everyone gets the same scares. An improv-driven version where actors build on whatever guests do runs on Free Will."
  },
  {
    id: "motivation",
    name: "Motivation",
    shortDescription: "Why participants keep going — the engagement engine of the experience.",
    detailedDescription: "Motivation covers the incentives that sustain attention: pure curiosity, inherently satisfying mechanics, difficulty and mastery, steady reinforcement, or explicit reward systems. Matching the motivation style to the audience is often the difference between an experience people finish and one they abandon.",
    example: "A language-learning quest can rely on Challenge (beat the conversation boss) or a Reward System (streaks, badges, and unlockable dialects)."
  },
  {
    id: "meta-control",
    name: "Meta Control",
    shortDescription: "Whether participants can shape the world and its rules, not just act inside them.",
    detailedDescription: "Meta Control ranges from playing the world exactly as given, to steering your own journey, defining your character, editing parts of the world, or building the world itself. High meta control turns participants into co-designers — powerful for ownership, demanding for the design.",
    example: "In a historical simulation, students who can redraw supply lines and re-run the campaign are using World Editor control rather than following a fixed scenario."
  },
  {
    id: "learning",
    name: "Learning",
    shortDescription: "How knowledge is delivered and absorbed within the experience.",
    detailedDescription: "Learning may arrive as small foundational pieces, direct explicit instruction, implicit absorption through doing, structured recall of prior knowledge, or synthesis where participants combine ideas into something new. Immersive design shines when the learning style is woven into the activity instead of bolted on.",
    example: "A chemistry escape room teaches Implicitly — players internalize reaction rules because the door will not open otherwise."
  },
  {
    id: "data",
    name: "Data",
    shortDescription: "What the experience knows about participants — personalization and tracking.",
    detailedDescription: "Data ranges from fully anonymous sessions, to knowing names and identities, tracking behavior within a session, maintaining persistent personal profiles, or responding to live biometric signals. More data enables deeper personalization and raises the bar for trust and transparency.",
    example: "A meditation space that softens its soundscape when a wearable reports rising heart rate is using Biometric data."
  },
  {
    id: "tech",
    name: "Tech",
    shortDescription: "The delivery platform — from no technology at all to fully mixed physical-digital systems.",
    detailedDescription: "Tech sets the platform assumptions: analog and physical, flat screens, augmented overlays on the real world, fully simulated virtual spaces, or mixed systems that span physical and digital. The strongest designs choose the lightest technology that still delivers the intended presence.",
    example: "A city history walk works on 2D (a map app), in AR (ghost buildings overlaid on real streets), or with no tech at all (props, actors, and good writing)."
  }
];

/* The grid of value names — spelling preserved exactly */
export const DEFAULT_ROWS = [
  ["Passive", "Detached", "Single Person", "None", "Predetermined", "None", "None", "Elemental", "Anonymous", "none"],
  ["Interactive", "Observer", "One on One", "Setting", "Choice", "Basic Mechanics", "Journey", "Explicit", "Identity", "2D"],
  ["Problem Solving", "First Person POV", "Group", "Pre-created", "Free Will", "Challenge", "Character", "Implicit", "In-session", "AR"],
  ["Physicalized", "Movement Control", "MMO", "Choose your own", "Conversational Reality", "Reinforcement", "World Editor", "Recall", "Personalized", "VR"],
  ["Interpersonal", "Human to Human", "Secondary Perspective", "Adaptive Story", "Adjustible POV", "Reward System", "World Builder", "Sythensis", "Biometric", "XR"]
];

/* Per-value starter descriptions, keyed by column id → value text.
   short = one-sentence definition · detailed = fuller explanation
   · example = an immersive-design example */
export const VALUE_STARTERS = {
  "interactivity": {
    "Passive": {
      short: "Participants primarily observe as the experience unfolds around them.",
      detailed: "Passive interactivity puts the participant in the audience seat: the experience runs regardless of what they do. This gives the designer complete control of pacing, framing, and emotional beats, at the cost of participant agency.",
      example: "A planetarium show — visitors recline and watch a fully authored journey through the night sky."
    },
    "Interactive": {
      short: "Participants make simple choices or actions that visibly change the moment.",
      detailed: "Basic interactivity invites small, low-stakes actions — touching, choosing, triggering — whose effects are immediate and readable. It keeps participants engaged without requiring skill or commitment.",
      example: "A museum wall where touching a portrait makes the historical figure turn and introduce themselves."
    },
    "Problem Solving": {
      short: "Participants solve puzzles or challenges to move the experience forward.",
      detailed: "Problem solving makes progress conditional on thinking: participants must decode, deduce, assemble, or experiment. It creates strong engagement and earned satisfaction, and quietly teaches whatever the puzzles are made of.",
      example: "An escape room where each lock opens only when the team applies a real navigation technique used by 18th-century sailors."
    },
    "Physicalized": {
      short: "Participants act through movement and embodied physical action.",
      detailed: "Physicalized interactivity makes the body the controller — walking, reaching, balancing, building. Motor memory deepens learning and presence, and physical effort raises emotional investment.",
      example: "A firefighting trainer where participants drag real weighted hose lines through a smoke-filled corridor."
    },
    "Interpersonal": {
      short: "Participants interact socially — other people are the core interface.",
      detailed: "Interpersonal interactivity routes the experience through conversation, negotiation, and cooperation between humans. It produces the least predictable and often most memorable moments, since every social exchange is unique.",
      example: "A diplomacy simulation where each participant privately represents a nation and the treaty emerges from real conversations."
    }
  },
  "embodiment": {
    "Detached": {
      short: "Participants view the world from outside it, like studying a living diorama.",
      detailed: "A detached viewpoint keeps the participant separate from the scene — overhead, behind glass, or on a screen. Distance invites analysis and comparison rather than visceral reaction, which suits reflective or strategic experiences.",
      example: "A war-room table view where students watch a battle unfold as movable pieces across a map."
    },
    "Observer": {
      short: "Participants stand inside the world but remain unseen by it.",
      detailed: "The observer is present at human scale yet invisible to the world — a ghost at the banquet. This creates intimacy without responsibility: participants witness events closely but cannot be addressed or blamed.",
      example: "A VR scene where you stand in the kitchen of a 1920s restaurant as the staff argue around you, unaware of your presence."
    },
    "First Person POV": {
      short: "Participants inhabit the world through their own eyes.",
      detailed: "First person embodiment makes the participant the protagonist: the world addresses them, reacts to them, and holds them accountable. It is the strongest lever for empathy and presence, and the most demanding to sustain.",
      example: "An immigration-history experience where clerks question you directly and stamp — or refuse — your papers."
    },
    "Movement Control": {
      short: "Participants' physical movement is tracked and mirrored inside the world.",
      detailed: "Movement control binds the participant's body to the experience — gestures, steps, and posture drive what happens. The tight loop between motion and response produces deep presence and supports skill-based learning.",
      example: "A dance-history installation where your silhouette joins a projected ballroom and period dancers adapt to your steps."
    },
    "Human to Human": {
      short: "Presence comes from real people responding to real people.",
      detailed: "Human-to-human embodiment uses live actors, facilitators, or fellow participants as the medium. Nothing matches a real person's responsiveness; the design challenge shifts from technology to casting, training, and safety.",
      example: "An immersive theatre piece where a nurse character takes each visitor aside and asks for help with a moral decision."
    }
  },
  "co-participation": {
    "Single Person": {
      short: "A solo experience tuned for individual focus and pacing.",
      detailed: "Single-person design gives one participant the entire experience: private pacing, personal stakes, and no social pressure. It suits reflection, confession, and mastery — and it must carry all engagement without social energy.",
      example: "A one-person audio walk where the narrator seems to know which bench you just sat on."
    },
    "One on One": {
      short: "An intimate pairing — one participant with one partner or guide.",
      detailed: "One-on-one structures the experience around a single relationship: mentor and student, interrogator and suspect, stranger and stranger. The intensity of undivided attention makes even simple scenes feel significant.",
      example: "A ten-minute encounter where a 'time traveler' interviews each visitor privately about the present day."
    },
    "Group": {
      short: "A small group shares the experience and shapes it together.",
      detailed: "Group participation makes the experience collective: roles emerge, decisions are negotiated, and memories are shared. Groups self-entertain and self-teach, but designs must handle dominant voices and passengers.",
      example: "A six-person lunar-base scenario where the team must allocate limited oxygen during a systems failure."
    },
    "MMO": {
      short: "Many participants inhabit the same persistent world at once.",
      detailed: "Massively multi-participant structures create societies rather than sessions: economies, reputations, and cultures form among strangers. The designer sets conditions and incentives rather than scripting outcomes.",
      example: "A semester-long online civilization where hundreds of students trade, legislate, and occasionally start wars."
    },
    "Secondary Perspective": {
      short: "Some participants act while others watch and influence from a second vantage point.",
      detailed: "Asymmetric participation splits the audience into actors and influencers — players and coaches, performers and voters. The two layers see different information, and the interplay between them becomes the experience.",
      example: "One participant explores a haunted archive in VR while the rest of the class, seeing the floor plan, guides them by radio."
    }
  },
  "story": {
    "None": {
      short: "No imposed narrative — meaning emerges from what participants do.",
      detailed: "Story-free design trusts the activity itself: sandbox play, open exploration, or pure challenge. Participants author their own meaning, and the designer's craft moves into systems and spaces rather than plot.",
      example: "A materials playground where visitors combine gears, ramps, and marbles with no goal beyond what they invent."
    },
    "Setting": {
      short: "A rich setting implies a story without dictating one.",
      detailed: "Setting-driven narrative embeds stories in the environment — props, documents, wear and tear, overheard fragments. Participants reconstruct what happened here, which makes discovery feel personal.",
      example: "An abandoned lighthouse keeper's quarters where the unmade bed, half-written letter, and stopped clock tell the story."
    },
    "Pre-created": {
      short: "A crafted narrative carries participants from beginning to end.",
      detailed: "A pre-created story delivers an authored arc with controlled reveals, pacing, and payoff. It guarantees narrative quality for every participant, in exchange for limited deviation.",
      example: "A guided descent through a mine where each chamber advances one chapter of a documented 1907 disaster."
    },
    "Choose your own": {
      short: "Branching paths let participants steer where the narrative goes.",
      detailed: "Branching narrative offers authored choices with authored consequences. Participants feel ownership of the path they took — and replay value comes from the paths they didn't.",
      example: "A courtroom drama where the audience's verdict at each recess determines which witnesses appear next."
    },
    "Adaptive Story": {
      short: "The story quietly reshapes itself around participant behavior.",
      detailed: "Adaptive narrative watches what participants do — where they linger, whom they trust — and bends the story to fit. Done well it feels like the world simply noticing them; the craft lies in hiding the machinery.",
      example: "A detective experience where the culprit is chosen mid-session to be whichever suspect the participant trusted most."
    }
  },
  "dynamics": {
    "Predetermined": {
      short: "Events run on rails, giving the designer full control of pacing and reveals.",
      detailed: "Predetermined dynamics fix the sequence of events regardless of participant action. Every moment can be composed like film — lighting, timing, music — which makes it the most reliable way to deliver a precise emotional arc.",
      example: "A dark ride through a volcano's eruption timeline: every tremor and reveal hits at the same rehearsed second."
    },
    "Choice": {
      short: "Discrete decision points hand participants agency at key beats.",
      detailed: "Choice-based dynamics alternate authored passages with meaningful forks. Participants feel responsible for outcomes while the designer keeps every branch craftable and testable.",
      example: "A pandemic-response scenario that pauses three times to let the room vote: lockdown, borders, or vaccines first."
    },
    "Free Will": {
      short: "Participants act freely and the system responds to whatever they try.",
      detailed: "Free-will dynamics promise that any reasonable action gets a reasonable response. This demands robust systems or improvising humans, and produces the strongest sense of a world that genuinely exists.",
      example: "A living medieval market where participants can haggle, steal, work, or simply follow the baker home."
    },
    "Conversational Reality": {
      short: "The world negotiates with participants through open-ended dialogue.",
      detailed: "Conversational dynamics make talk the engine: characters, guides, or systems that listen and answer in kind. The experience becomes a relationship, and its quality tracks the quality of the listening.",
      example: "An oracle chamber where an AI priestess answers any question about the ancient city — in character, from evidence."
    },
    "Adjustible POV": {
      short: "Participants can shift their point of view to see the system from new angles.",
      detailed: "Adjustable-perspective dynamics let participants re-see the same events — as another character, at another scale, or at another time. Comparing viewpoints becomes the core activity and the core lesson.",
      example: "A labor-strike simulation where participants can replay the same week as the worker, the owner, and the mayor."
    }
  },
  "motivation": {
    "None": {
      short: "Engagement rides on curiosity alone — no external incentives.",
      detailed: "Incentive-free design trusts intrinsic interest: the subject, the space, and the activity must be their own reward. It filters for genuine engagement and imposes the highest standard on content quality.",
      example: "An unmarked door in a library that simply opens into a perfect recreation of Darwin's study — stay as long as you like."
    },
    "Basic Mechanics": {
      short: "Simple, satisfying mechanics keep hands and minds engaged.",
      detailed: "Mechanics-driven motivation uses inherently pleasant loops — collecting, matching, stacking, popping — to sustain attention. The loop carries participants through content they might not otherwise sit still for.",
      example: "A recycling exhibit where sorting waste into the right chutes is made as tactile and satisfying as an arcade game."
    },
    "Challenge": {
      short: "Difficulty itself is the draw, so mastery feels earned.",
      detailed: "Challenge-based motivation sets a bar participants must genuinely reach — and the possibility of failure is what makes success mean something. Tuning difficulty to the audience is the whole game.",
      example: "A code-breaking room with a posted 22% success rate; teams line up specifically because most fail."
    },
    "Reinforcement": {
      short: "Steady feedback loops reward every bit of progress.",
      detailed: "Reinforcement keeps a continuous stream of small confirmations flowing — sounds, lights, tallies, nods — so participants always feel motion. It is gentle and inclusive, and it needs an occasional larger payoff to avoid feeling hollow.",
      example: "A language market where every successfully used phrase makes the stall-keeper visibly friendlier and the prices visibly better."
    },
    "Reward System": {
      short: "Explicit rewards give structure to long-term engagement.",
      detailed: "Reward systems formalize progress: points, ranks, badges, unlocks. They excel at sustaining engagement across sessions and groups, and they risk replacing the subject with the scoreboard if the rewards outshine the content.",
      example: "A museum passport program where stamps from twelve challenge stations unlock an after-hours vault tour."
    }
  },
  "meta-control": {
    "None": {
      short: "Participants play within the world exactly as designed.",
      detailed: "With no meta control, the world's rules and shape are fixed; participants act inside them but never on them. This keeps every session coherent and comparable — the designer's vision arrives intact.",
      example: "A tightly staged submarine drama where the crew stations, the fault, and the fate of the boat are the same every night."
    },
    "Journey": {
      short: "Participants control their own path through the world, not the world itself.",
      detailed: "Journey control grants navigational freedom: which room, which order, which thread to pull. The world is fixed but the route is yours, so every participant's version differs by path rather than content.",
      example: "An open museum night where visitors chart their own course through forty unlocked period rooms."
    },
    "Character": {
      short: "Participants shape who they are within the world.",
      detailed: "Character control lets participants define their identity — role, values, backstory, allegiance — and the world responds to who they chose to be. Identity investment is one of the strongest known engagement hooks.",
      example: "A frontier-town weekend where each guest builds a persona on arrival, and the sheriff treats the banker and the drifter very differently."
    },
    "World Editor": {
      short: "Participants can modify parts of the world as they go.",
      detailed: "World-editing hands participants real levers: move the furniture, change the law, redirect the river. Their changes persist and affect others, making consequences — intended and not — the central lesson.",
      example: "An ecosystem simulation where students may introduce or remove one species per session, and next week's class inherits the results."
    },
    "World Builder": {
      short: "Participants construct the world itself — creation is the experience.",
      detailed: "World-building makes participants the authors: they design the spaces, rules, and stories that others (or they themselves) then inhabit. The deepest form of ownership, and the one that most requires good tools.",
      example: "A semester project where each team builds one district of a shared future city that the whole school then explores."
    }
  },
  "learning": {
    "Elemental": {
      short: "Knowledge arrives in small foundational pieces that stack.",
      detailed: "Elemental learning decomposes the subject into atoms — one concept, one gesture, one fact at a time — sequenced so each piece rests on the last. It is forgiving and thorough, ideal for true beginners.",
      example: "A bread-baking journey where station one is only flour, station two only water and hydration, station three only yeast."
    },
    "Explicit": {
      short: "Learning goals are named openly and taught directly.",
      detailed: "Explicit learning tells participants what they are here to learn, teaches it, and confirms they got it. Clarity speeds acquisition and suits assessment; the immersive craft lies in keeping directness from flattening wonder.",
      example: "A flight-deck experience that opens with 'By the end you will perform a full pre-flight check' — and ends with you performing one."
    },
    "Implicit": {
      short: "Learning happens through doing — absorbed rather than taught.",
      detailed: "Implicit learning hides the curriculum inside the activity: participants master the content because the experience is unplayable without it. Knowledge acquired this way tends to stick, since it was never 'studied.'",
      example: "A trading-port game where players end up fluent in supply and demand without the words ever appearing on screen."
    },
    "Recall": {
      short: "Participants retrieve and apply what they already know.",
      detailed: "Recall-based design turns memory into gameplay: prior knowledge is the key that opens the experience's locks. Retrieval strengthens retention far more than re-reading, and it flatters participants by trusting what they know.",
      example: "A 'night before the exam' mystery where every clue is solvable only with material from the semester's readings."
    },
    "Sythensis": {
      short: "Participants combine ideas into something new of their own.",
      detailed: "Synthesis asks participants to connect, transform, and create — the top of the learning ladder. The experience supplies raw materials and constraints; participants supply the insight that binds them into something original.",
      example: "A closing studio session where teams must design a museum exhibit about the very experience they just completed."
    }
  },
  "data": {
    "Anonymous": {
      short: "No participant data is kept — every session starts clean.",
      detailed: "Anonymous design treats every participant identically and remembers nothing. It maximizes privacy and lowers barriers to vulnerable participation, at the cost of continuity and personalization.",
      example: "A confession-booth installation that visibly shreds its only transcript as each visitor leaves."
    },
    "Identity": {
      short: "The experience knows who participants are and greets them accordingly.",
      detailed: "Identity-aware design recognizes participants — names, faces, membership — and folds that recognition into the experience. Being known by name is a disproportionately powerful presence cue.",
      example: "A wizarding academy where the sorting ceremony addresses each student by name before the room reacts."
    },
    "In-session": {
      short: "Behavior is tracked within a session so the experience adapts in the moment.",
      detailed: "In-session tracking watches what participants do right now — pace, choices, hesitation — and tunes difficulty, pacing, or content live. Everything is forgotten at the exit, keeping adaptation without long-term profiles.",
      example: "A horror maze that counts your hesitations and quietly reroutes you toward — or away from — the intense wing."
    },
    "Personalized": {
      short: "A persistent profile tailors the experience across visits.",
      detailed: "Personalization remembers participants between sessions: progress, preferences, and history shape each return. It enables long arcs and genuine relationships with the experience, and it demands transparent, trustworthy data handling.",
      example: "A museum companion that greets returning families with 'Last time you loved the Egypt wing — the new mummy scan is ready.'"
    },
    "Biometric": {
      short: "Physiological signals — heart rate, gaze, motion — tune the experience live.",
      detailed: "Biometric response reads the body directly and adapts to genuine, unfakeable states: fear, calm, attention. It enables experiences that meet participants exactly where they are, with correspondingly serious consent obligations.",
      example: "A deep-sea descent that only surfaces the anglerfish once your measured heart rate has settled."
    }
  },
  "tech": {
    "none": {
      short: "No technology at all — a fully physical, analog experience.",
      detailed: "Tech-free design relies on space, objects, print, and people. Nothing can crash, nothing needs charging, and nothing stands between participants and the material — but every effect must be achieved physically.",
      example: "A 1940s radio-drama evening staged entirely with practical props, live foley, and actors — not one screen in the building."
    },
    "2D": {
      short: "A screen-based experience on ordinary displays.",
      detailed: "2D delivery uses the screens everyone already has — phones, laptops, projectors. It is the most accessible and distributable platform, trading physical presence for reach, and it rewards strong interface craft.",
      example: "A browser-based archive dive where dragging documents around a virtual desk slowly assembles a family's immigration story."
    },
    "AR": {
      short: "Digital content overlaid onto the real world.",
      detailed: "Augmented reality annotates reality: the participant's actual surroundings remain primary, with digital layers adding what is invisible — the past, the hidden, the explanatory. Strongest where place itself matters.",
      example: "A battlefield walk where raising your phone shows the troop lines advancing across the very field you are standing on."
    },
    "VR": {
      short: "A fully immersive simulated space.",
      detailed: "Virtual reality replaces the participant's entire sensory world, enabling the impossible: other scales, other centuries, other bodies. Total control of the environment comes with hardware friction and per-person throughput limits.",
      example: "A cell-biology voyage where students shrink to protein scale and physically duck under a passing ribosome."
    },
    "XR": {
      short: "A mixed system spanning physical and digital space.",
      detailed: "Extended reality blends physical sets, tracked objects, and digital layers into one continuous world — real props you can touch, virtual events you can only see. The richest presence available, and the most complex to orchestrate.",
      example: "A haunted manor where the physical door you push creaks open onto a virtual ballroom, and the cold you feel is a real fan."
    }
  }
};

/* Builds the full schema-v3 default taxonomy with stable ids on
   every column and every value. Value ids are deterministic for
   the defaults so resets stay stable across sessions. */
export function buildDefaultTaxonomy() {
  const columns = structuredClone(DEFAULT_COLUMNS);
  const rows = DEFAULT_ROWS.map((row, r) =>
    row.map((text, c) => {
      const colId = columns[c].id;
      const starter = (VALUE_STARTERS[colId] || {})[text] || { short: "", detailed: "", example: "" };
      return {
        id: `${colId}-r${r}`,               // deterministic default id
        text,
        shortDescription: starter.short,
        detailedDescription: starter.detailed,
        example: starter.example
      };
    })
  );
  return { schemaVersion: 3, columns, rows };
}
