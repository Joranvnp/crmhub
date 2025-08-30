export type ModuleItem = {
  slug: string;
  name: string;
  category: "family" | "prod" | "finance" | "social";
  description: string;
};

export const ALL_MODULES: ModuleItem[] = [
  {
    slug: "fridge-track",
    name: "FridgeTrack",
    category: "family",
    description: "Dates de péremption",
  },
  {
    slug: "meal-plan",
    name: "MealPlan",
    category: "family",
    description: "Plan repas + courses",
  },
  {
    slug: "kid-cal",
    name: "KidCal",
    category: "family",
    description: "Agenda scolaire",
  },
  {
    slug: "kid-schedule",
    name: "KidSchedule",
    category: "family",
    description: "Activités enfants",
  },
  {
    slug: "chore-points",
    name: "ChorePoints",
    category: "family",
    description: "Corvées + points",
  },
  {
    slug: "pet-care",
    name: "PetCare Remind",
    category: "family",
    description: "Rappels véto/soins",
  },
  {
    slug: "pet-diary",
    name: "PetDiary",
    category: "family",
    description: "Journal animaux",
  },
  {
    slug: "move-meter",
    name: "MoveMeter",
    category: "family",
    description: "Checklist déménagement",
  },
  {
    slug: "quick-rsvp",
    name: "QuickRSVP",
    category: "social",
    description: "Page réponses événement",
  },
  {
    slug: "quick-split",
    name: "QuickSplit",
    category: "social",
    description: "Partager l’addition",
  },
  {
    slug: "loan-track",
    name: "LoanTrack",
    category: "finance",
    description: "Suivi crédits",
  },
  {
    slug: "debts",
    name: "Gestion des dettes",
    category: "finance",
    description: "Qui doit quoi",
  },
  {
    slug: "waitlist",
    name: "WaitList",
    category: "social",
    description: "File d’attente commerce",
  },
  {
    slug: "inbox-zero",
    name: "InboxZero",
    category: "prod",
    description: "Nettoyer la boîte mail",
  },
  {
    slug: "task-mail",
    name: "TaskMail",
    category: "prod",
    description: "Mails → tâches",
  },
  {
    slug: "micro-survey",
    name: "MicroSurvey",
    category: "prod",
    description: "Sondages express",
  },
  {
    slug: "file-drop",
    name: "FileDrop",
    category: "prod",
    description: "Partage fichier PC ↔ tel",
  },
  {
    slug: "focus-tabs",
    name: "FocusTabs",
    category: "prod",
    description: "Sessions d’onglets",
  },
  {
    slug: "quick-contract",
    name: "QuickContract",
    category: "prod",
    description: "Contrats simples",
  },
  {
    slug: "quick-portfolio",
    name: "QuickPortfolio",
    category: "prod",
    description: "Portfolio instantané",
  },
  {
    slug: "clip-save",
    name: "ClipSave",
    category: "prod",
    description: "Extraits web",
  },
  {
    slug: "content-ideas",
    name: "ContentIdeas",
    category: "prod",
    description: "Idées de contenus",
  },
  {
    slug: "mini-crm",
    name: "MiniCRM",
    category: "prod",
    description: "Suivi clients simple",
  },
  {
    slug: "focus-room",
    name: "FocusRoom",
    category: "prod",
    description: "Pomodoro en groupe",
  },
  {
    slug: "resume-track",
    name: "ResumeTrack",
    category: "prod",
    description: "Suivi de candidatures",
  },
  {
    slug: "live",
    name: "Live Monitor",
    category: "prod",
    description: "Détecte si un live est en cours et récupère le .m3u8",
  },
];
