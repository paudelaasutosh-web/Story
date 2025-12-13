export enum Genre {
  Fantasy = "Fantasy",
  SciFi = "Sci-Fi",
  Mystery = "Mystery",
  Horror = "Horror",
  Romance = "Romance",
  Supernatural = "Supernatural",
  Thriller = "Thriller",
  Philosophy = "Philosophy"
}

export interface GenreOption {
  category: Genre;
  subGenre?: string;
}

export interface CharacterSetupData {
  protagonists: string[];
  antagonists: string[];
  support: string[];
}

export interface Character {
  name: string;
  role: string;
  affinity: number; // 0-100
  status: string; // e.g., "Suspicious", "In Love", "Injured"
  description: string;
}

export interface Choice {
  id: string;
  text: string;
  tone: 'brave' | 'cautious' | 'witty' | 'romantic' | 'aggressive' | 'neutral';
}

export interface StoryStats {
  tension: number; // 0-100
  mystery: number; // 0-100
  romance: number; // 0-100
  hope: number; // 0-100
}

export interface StoryNode {
  id: string;
  chapterTitle: string;
  content: string;
  choices: Choice[];
  characterUpdates: Partial<Character>[]; // Updates to apply to state
  stats: StoryStats;
  summary: string; // Short summary for the DNA tree
  backgroundImagePrompt?: string; // For generating visuals
}

export type ViewState = 'MENU' | 'MODE_SELECTION' | 'GENRE' | 'CHARACTERS' | 'LOADING' | 'GAME' | 'EXIT';

export type GameMode = 'INTERACTIVE' | 'LINEAR';

export interface SavedStory {
  id: string;
  title: string;
  date: string;
  genre: GenreOption;
  history: StoryNode[];
  characters: Character[];
  statsHistory: StoryStats[];
  gameMode: GameMode;
}

export interface UserStats {
  storiesCreated: number;
  storiesCompleted: number; // Reaching an end node
  rankTitle: string;
}

export interface GameState {
  currentView: ViewState;
  gameMode: GameMode;
  selectedGenre: GenreOption | null;
  characterSetup: CharacterSetupData;
  storyHistory: StoryNode[];
  characters: Character[];
  isLoading: boolean;
  error: string | null;
  isGameOver: boolean;
  statsHistory: StoryStats[];
  storyLength: number; // Desired word count
  customPrompt: string; // Optional user description
}