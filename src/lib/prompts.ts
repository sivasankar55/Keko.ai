export interface Prompt {
  id: string;
  category: string;
  title: string;
  body: string;
  personaId?: string;
}

export const PROMPTS: Prompt[] = [
  // Writing
  { id: 'p1', category: 'Writing', title: 'Edit my writing', body: "Edit the following text for clarity, flow, and conciseness. Preserve my voice. Then explain the most important changes in 3 short bullets.\n\n---\n\n[paste here]", personaId: 'muse' },
  { id: 'p2', category: 'Writing', title: 'Brainstorm titles', body: 'Give me 10 distinct, vivid titles for an article about [topic]. Range from playful to serious. Avoid clichés.', personaId: 'muse' },
  { id: 'p3', category: 'Writing', title: 'Rewrite as a story', body: "Rewrite this idea as the opening paragraph of a literary short story. Be specific. Show, don't tell.\n\n[idea]", personaId: 'muse' },

  // Code
  { id: 'p4', category: 'Code', title: 'Review this code', body: "Review this code. Point out bugs, edge cases, and unclear naming. Then suggest a cleaner version.\n\n```\n[paste code]\n```", personaId: 'mentor' },
  { id: 'p5', category: 'Code', title: 'Explain this function', body: "Explain this function line by line. Then describe what could go wrong with it.\n\n```\n[paste]\n```", personaId: 'mentor' },
  { id: 'p6', category: 'Code', title: 'Help me debug', body: "I'm getting this error:\n\n```\n[error]\n```\n\nIn this code:\n\n```\n[code]\n```\n\nWhat's the cause and how do I fix it?", personaId: 'mentor' },

  // Thinking
  { id: 'p7', category: 'Thinking', title: 'Frame a decision', body: "I'm trying to decide between [A] and [B]. Help me frame this. What are the real tradeoffs? What am I likely missing?", personaId: 'strategist' },
  { id: 'p8', category: 'Thinking', title: 'Pre-mortem', body: "Imagine [project / decision] failed in 6 months. Working backward, what are the 3 most likely reasons? How would I prevent each?", personaId: 'strategist' },
  { id: 'p9', category: 'Thinking', title: 'Steelman the other side', body: 'I believe [position]. Steelman the strongest opposing view, then point out which parts of it I should genuinely take seriously.', personaId: 'strategist' },

  // Daily
  { id: 'p10', category: 'Daily', title: 'Check in with me', body: "Ask me a thoughtful, open question to help me reflect on my day. Listen first, follow up gently. Don't try to fix anything unless I ask.", personaId: 'sage' },
  { id: 'p11', category: 'Daily', title: 'Plan my day', body: "I have these to-dos:\n\n[list]\n\nHelp me think about what to actually focus on today, given limited energy. Be honest about what to drop.", personaId: 'strategist' },
  { id: 'p12', category: 'Daily', title: 'What\u2019s for dinner', body: "I have these in the fridge: [ingredients]. Suggest 3 dinners I could make in under 30 minutes. Pick varied cuisines.", personaId: 'chef' },

  // Curious
  { id: 'p13', category: 'Curious', title: 'Explain like I\u2019m smart', body: 'Explain [topic] to me as if I\u2019m a curious adult who knows nothing about the field but reads carefully. Skip the obvious analogies.', personaId: 'keko' },
  { id: 'p14', category: 'Curious', title: 'Compare and contrast', body: 'Compare [X] and [Y] across 4 dimensions I might not have considered. End with the question I should actually be asking instead.', personaId: 'keko' },
  { id: 'p15', category: 'Curious', title: 'Teach me something new', body: "Pick one surprising idea from [field] and walk me through it. Use a concrete example I'll remember tomorrow.", personaId: 'keko' },
];

export const CATEGORIES = Array.from(new Set(PROMPTS.map((p) => p.category)));
