/**
 * Voix « publiques » OmniVoice — recettes instruct curatées.
 * OmniVoice n’a pas de catalogue d’IDs type ElevenLabs ; le design mode
 * utilise des attributs (gender, age, pitch, accent…).
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
  /** Langues où cette voix est la plus naturelle */
  bestFor?: string[];
};

export const PUBLIC_VOICES: PublicVoice[] = [
  {
    id: "auto",
    name: "Auto OmniVoice",
    blurb: "Choix automatique du modèle",
    instruct: "",
    gender: "",
    age: "",
    pitch: "",
  },
  {
    id: "amina",
    name: "Amina",
    blurb: "Femme jeune, timbre clair",
    instruct: "female, young adult, moderate pitch",
    gender: "female",
    age: "young adult",
    pitch: "moderate pitch",
    bestFor: ["fr", "wo", "en"],
  },
  {
    id: "fatou",
    name: "Fatou",
    blurb: "Femme adulte, voix chaude",
    instruct: "female, middle-aged, low pitch",
    gender: "female",
    age: "middle-aged",
    pitch: "low pitch",
    bestFor: ["fr", "wo"],
  },
  {
    id: "mariama",
    name: "Mariama",
    blurb: "Femme, ton plus aigu",
    instruct: "female, young adult, high pitch",
    gender: "female",
    age: "young adult",
    pitch: "high pitch",
    bestFor: ["fr", "en", "sn"],
  },
  {
    id: "omar",
    name: "Omar",
    blurb: "Homme jeune, narration",
    instruct: "male, young adult, moderate pitch",
    gender: "male",
    age: "young adult",
    pitch: "moderate pitch",
    bestFor: ["fr", "wo", "ar"],
  },
  {
    id: "ibrahima",
    name: "Ibrahima",
    blurb: "Homme adulte, grave",
    instruct: "male, middle-aged, low pitch",
    gender: "male",
    age: "middle-aged",
    pitch: "low pitch",
    bestFor: ["fr", "wo", "sn"],
  },
  {
    id: "kwa",
    name: "Kofi",
    blurb: "Homme jeune, énergique",
    instruct: "male, young adult, high pitch",
    gender: "male",
    age: "young adult",
    pitch: "high pitch",
    bestFor: ["en", "sn", "sw"],
  },
  {
    id: "elena",
    name: "Elena",
    blurb: "EN — accent britannique",
    instruct: "female, young adult, moderate pitch, british accent",
    gender: "female",
    age: "young adult",
    pitch: "moderate pitch",
    accent: "british accent",
    bestFor: ["en"],
  },
  {
    id: "james",
    name: "James",
    blurb: "EN — accent américain",
    instruct: "male, middle-aged, moderate pitch, american accent",
    gender: "male",
    age: "middle-aged",
    pitch: "moderate pitch",
    accent: "american accent",
    bestFor: ["en"],
  },
  {
    id: "whisper-soft",
    name: "Chuchotement",
    blurb: "Voix douce, style whisper",
    instruct: "female, young adult, moderate pitch, whisper",
    gender: "female",
    age: "young adult",
    pitch: "moderate pitch",
    whisper: true,
    bestFor: ["fr", "en"],
  },
];
