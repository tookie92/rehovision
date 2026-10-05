/**
 * Voix publiques OmniVoice = recettes `instruct` curatées.
 * Pas de catalogue d'IDs ni de clones célébrités (omnivoice.app / Fish).
 */
export type PublicVoice = {
  id: string;
  name: string;
  blurb: string;
  instruct: string;
  gender: string;
  age: string;
  pitch: string;
  accent?: string;
  whisper?: boolean;
  /** Tags UI (FR) */
  tags: string[];
  /** Langues où cette voix est la plus naturelle */
  bestFor?: string[];
};

const GENDER_TAG: Record<string, string> = {
  male: "Homme",
  female: "Femme",
};

const AGE_TAG: Record<string, string> = {
  child: "Enfant",
  teenager: "Ado",
  "young adult": "Jeune",
  "middle-aged": "Adulte",
  elderly: "Aîné",
};

const PITCH_TAG: Record<string, string> = {
  "very low pitch": "Très grave",
  "low pitch": "Grave",
  "moderate pitch": "Médium",
  "high pitch": "Aigu",
  "very high pitch": "Très aigu",
};

const ACCENT_TAG: Record<string, string> = {
  "american accent": "Américain",
  "british accent": "Britannique",
  "australian accent": "Australien",
  "canadian accent": "Canadien",
  "indian accent": "Indien",
};

function buildTags(partial: {
  gender?: string;
  age?: string;
  pitch?: string;
  accent?: string;
  whisper?: boolean;
  extra?: string[];
}): string[] {
  const tags: string[] = [];
  if (partial.gender && GENDER_TAG[partial.gender]) {
    tags.push(GENDER_TAG[partial.gender]);
  }
  if (partial.age && AGE_TAG[partial.age]) {
    tags.push(AGE_TAG[partial.age]);
  }
  if (partial.pitch && PITCH_TAG[partial.pitch]) {
    tags.push(PITCH_TAG[partial.pitch]);
  }
  if (partial.accent && ACCENT_TAG[partial.accent]) {
    tags.push(ACCENT_TAG[partial.accent]);
  }
  if (partial.whisper) tags.push("Chuchotement");
  if (partial.extra) tags.push(...partial.extra);
  return tags;
}

export const PUBLIC_VOICES: PublicVoice[] = [
  {
    id: "auto",
    name: "Auto",
    blurb: "Choix automatique du modèle",
    instruct: "",
    gender: "",
    age: "",
    pitch: "",
    tags: ["Auto", "OmniVoice"],
  },
  {
    id: "amina",
    name: "Amina",
    blurb: "Narration claire, jeune",
    instruct: "female, young adult, moderate pitch",
    gender: "female",
    age: "young adult",
    pitch: "moderate pitch",
    tags: buildTags({
      gender: "female",
      age: "young adult",
      pitch: "moderate pitch",
      extra: ["Narration", "Clair"],
    }),
    bestFor: ["fr", "wo", "en"],
  },
  {
    id: "fatou",
    name: "Fatou",
    blurb: "Voix chaude, adulte",
    instruct: "female, middle-aged, low pitch",
    gender: "female",
    age: "middle-aged",
    pitch: "low pitch",
    tags: buildTags({
      gender: "female",
      age: "middle-aged",
      pitch: "low pitch",
      extra: ["Chaude", "Podcast"],
    }),
    bestFor: ["fr", "wo"],
  },
  {
    id: "mariama",
    name: "Mariama",
    blurb: "Timbre plus aigu",
    instruct: "female, young adult, high pitch",
    gender: "female",
    age: "young adult",
    pitch: "high pitch",
    tags: buildTags({
      gender: "female",
      age: "young adult",
      pitch: "high pitch",
      extra: ["Vif"],
    }),
    bestFor: ["fr", "en", "sn"],
  },
  {
    id: "omar",
    name: "Omar",
    blurb: "Narration homme jeune",
    instruct: "male, young adult, moderate pitch",
    gender: "male",
    age: "young adult",
    pitch: "moderate pitch",
    tags: buildTags({
      gender: "male",
      age: "young adult",
      pitch: "moderate pitch",
      extra: ["Narration"],
    }),
    bestFor: ["fr", "wo", "ar"],
  },
  {
    id: "ibrahima",
    name: "Ibrahima",
    blurb: "Grave, posé",
    instruct: "male, middle-aged, low pitch",
    gender: "male",
    age: "middle-aged",
    pitch: "low pitch",
    tags: buildTags({
      gender: "male",
      age: "middle-aged",
      pitch: "low pitch",
      extra: ["Posé", "Docu"],
    }),
    bestFor: ["fr", "wo", "sn"],
  },
  {
    id: "kwa",
    name: "Kofi",
    blurb: "Énergique",
    instruct: "male, young adult, high pitch",
    gender: "male",
    age: "young adult",
    pitch: "high pitch",
    tags: buildTags({
      gender: "male",
      age: "young adult",
      pitch: "high pitch",
      extra: ["Énergique"],
    }),
    bestFor: ["en", "sn", "sw"],
  },
  {
    id: "salle",
    name: "Salle",
    blurb: "Femme aînée, douce",
    instruct: "female, elderly, low pitch",
    gender: "female",
    age: "elderly",
    pitch: "low pitch",
    tags: buildTags({
      gender: "female",
      age: "elderly",
      pitch: "low pitch",
      extra: ["Douce"],
    }),
    bestFor: ["fr", "wo"],
  },
  {
    id: "moussa",
    name: "Moussa",
    blurb: "Homme aîné, autorité",
    instruct: "male, elderly, very low pitch",
    gender: "male",
    age: "elderly",
    pitch: "very low pitch",
    tags: buildTags({
      gender: "male",
      age: "elderly",
      pitch: "very low pitch",
      extra: ["Autorité"],
    }),
    bestFor: ["fr", "ar", "wo"],
  },
  {
    id: "aisha",
    name: "Aïsha",
    blurb: "Ado, légère",
    instruct: "female, teenager, high pitch",
    gender: "female",
    age: "teenager",
    pitch: "high pitch",
    tags: buildTags({
      gender: "female",
      age: "teenager",
      pitch: "high pitch",
      extra: ["Léger"],
    }),
    bestFor: ["fr", "en"],
  },
  {
    id: "elena",
    name: "Elena",
    blurb: "Accent britannique (EN)",
    instruct: "female, young adult, moderate pitch, british accent",
    gender: "female",
    age: "young adult",
    pitch: "moderate pitch",
    accent: "british accent",
    tags: buildTags({
      gender: "female",
      age: "young adult",
      pitch: "moderate pitch",
      accent: "british accent",
      extra: ["EN"],
    }),
    bestFor: ["en"],
  },
  {
    id: "james",
    name: "James",
    blurb: "Accent américain (EN)",
    instruct: "male, middle-aged, moderate pitch, american accent",
    gender: "male",
    age: "middle-aged",
    pitch: "moderate pitch",
    accent: "american accent",
    tags: buildTags({
      gender: "male",
      age: "middle-aged",
      pitch: "moderate pitch",
      accent: "american accent",
      extra: ["EN"],
    }),
    bestFor: ["en"],
  },
  {
    id: "whisper-soft",
    name: "Chuchotement",
    blurb: "Style whisper",
    instruct: "female, young adult, moderate pitch, whisper",
    gender: "female",
    age: "young adult",
    pitch: "moderate pitch",
    whisper: true,
    tags: buildTags({
      gender: "female",
      age: "young adult",
      pitch: "moderate pitch",
      whisper: true,
      extra: ["Doux"],
    }),
    bestFor: ["fr", "en"],
  },
];

export function publicVoiceTags(voice: PublicVoice): string[] {
  return voice.tags.length ? voice.tags : buildTags(voice);
}
