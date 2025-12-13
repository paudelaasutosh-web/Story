import React, { useState, useEffect } from 'react';
import { Genre, StoryNode, GameState, Character, GenreOption, CharacterSetupData, GameMode, SavedStory, UserStats } from './types';
import { startStory, continueStory } from './services/geminiService';
import BookLayout from './components/BookLayout';
import { PenTool, Sparkles, AlertCircle, Play, Settings, LogOut, ChevronRight, UserPlus, Users, X, ShieldAlert, Heart, MousePointerClick, BookOpen, FileText, AlignLeft, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
// @ts-ignore
import { jsPDF } from 'jspdf';

// --- CONSTANTS ---
const GENRE_TREE = {
  [Genre.Fantasy]: ["High Fantasy", "Dark Fantasy", "Urban Fantasy"],
  [Genre.Romance]: ["Fantasy World", "Real Life", "Comedy", "Historical"],
  [Genre.Supernatural]: ["Horror", "Fantasy", "Vampire/Werewolf", "Ghost Story"],
  [Genre.SciFi]: ["Cyberpunk", "Space Opera", "Dystopian", "Time Travel"],
  [Genre.Horror]: ["Slasher", "Psychological", "Cosmic", "Haunted House"],
  [Genre.Thriller]: ["Horror", "Supernatural", "Crime", "Psychological"],
  [Genre.Philosophy]: ["Existential", "Stoic", "Absurdist", "Metaphysical", "Socratic"]
};

const LOADING_QUOTES = [
  "“There is no friend as loyal as a book.” – Ernest Hemingway",
  "“Fairy tales are more than true: not because they tell us that dragons exist, but because they tell us that dragons can be beaten.” – Neil Gaiman",
  "“I have always imagined that Paradise will be a kind of library.” – Jorge Luis Borges",
  "“We write to taste life twice, in the moment and in retrospect.” – Anaïs Nin",
  "“A reader lives a thousand lives before he dies.” – George R.R. Martin",
  "“The scariest moment is always just before you start.” – Stephen King"
];

const INITIAL_STATE: GameState = {
  currentView: 'MENU',
  gameMode: 'INTERACTIVE',
  selectedGenre: null,
  characterSetup: {
    protagonists: [''],
    antagonists: [],
    support: []
  },
  storyHistory: [],
  characters: [],
  isLoading: false,
  error: null,
  isGameOver: false,
  statsHistory: [],
  storyLength: 5000,
  customPrompt: ""
};

const INITIAL_USER_STATS: UserStats = {
  storiesCreated: 0,
  storiesCompleted: 0,
  rankTitle: "Novice Scribe"
};

function App() {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [currentQuote, setCurrentQuote] = useState(LOADING_QUOTES[0]);
  
  // Local Storage State
  const [savedStories, setSavedStories] = useState<SavedStory[]>([]);
  const [userStats, setUserStats] = useState<UserStats>(INITIAL_USER_STATS);
  const [showArchives, setShowArchives] = useState(false);

  // --- INITIALIZATION ---
  useEffect(() => {
    const loadedStories = localStorage.getItem('fableweaver_saves');
    const loadedStats = localStorage.getItem('fableweaver_stats');
    
    if (loadedStories) {
      setSavedStories(JSON.parse(loadedStories));
    }
    if (loadedStats) {
      setUserStats(JSON.parse(loadedStats));
    }
  }, []);

  const calculateRank = (stats: UserStats): string => {
    const score = stats.storiesCreated + (stats.storiesCompleted * 2);
    if (score > 50) return "Legendary Bard";
    if (score > 30) return "Master Weaver";
    if (score > 15) return "Fable Spinner";
    if (score > 5) return "Ink Wanderer";
    return "Novice Scribe";
  };

  const updateUserStats = (type: 'created' | 'completed') => {
    setUserStats(prev => {
      const newStats = {
        ...prev,
        storiesCreated: type === 'created' ? prev.storiesCreated + 1 : prev.storiesCreated,
        storiesCompleted: type === 'completed' ? prev.storiesCompleted + 1 : prev.storiesCompleted
      };
      newStats.rankTitle = calculateRank(newStats);
      localStorage.setItem('fableweaver_stats', JSON.stringify(newStats));
      return newStats;
    });
  };

  // --- LOADING BAR LOGIC ---
  useEffect(() => {
    let interval: any;
    if (gameState.currentView === 'LOADING') {
      setLoadingProgress(0);
      setCurrentQuote(LOADING_QUOTES[Math.floor(Math.random() * LOADING_QUOTES.length)]);
      
      interval = setInterval(() => {
        setLoadingProgress(prev => {
          // Slow down as we get closer to 90%, wait for actual API response to hit 100%
          const increment = prev < 50 ? 5 : prev < 80 ? 2 : prev < 90 ? 0.5 : 0;
          return Math.min(prev + increment, 90);
        });
      }, 200);
    }
    return () => clearInterval(interval);
  }, [gameState.currentView]);

  // --- ACTIONS ---

  const handleModeSelect = (mode: GameMode) => {
    setGameState(prev => ({
      ...prev,
      gameMode: mode,
      currentView: 'GENRE'
    }));
  };

  const handleGenreSelect = (category: Genre, subGenre?: string) => {
    setGameState(prev => ({
      ...prev,
      selectedGenre: { category, subGenre },
      currentView: 'CHARACTERS' // Move to character setup after genre
    }));
  };

  const handleStartGame = async () => {
    // Validation
    const prots = gameState.characterSetup.protagonists.filter(p => p.trim());
    if (prots.length === 0) {
      alert("Please add at least one protagonist.");
      return;
    }
    if (!gameState.selectedGenre) {
        setGameState(prev => ({ ...prev, currentView: 'GENRE' }));
        return;
    }

    setGameState(prev => ({ 
      ...prev, 
      currentView: 'LOADING',
      characterSetup: { ...prev.characterSetup, protagonists: prots }, // clean empty inputs
      error: null 
    }));

    try {
      const startNode = await startStory(
        gameState.selectedGenre, 
        gameState.characterSetup, 
        gameState.gameMode,
        gameState.storyLength,
        gameState.customPrompt
      );
      
      updateUserStats('created');

      // Force 100% loading before switching
      setLoadingProgress(100);
      
      setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          storyHistory: [startNode],
          characters: updateCharacters(prev.characters, startNode.characterUpdates),
          statsHistory: [startNode.stats],
          isLoading: false,
          currentView: 'GAME'
        }));
      }, 500); 

    } catch (e: any) {
      let errorMessage = "Failed to generate story. Please check your API Key or connection.";
      if (e.message?.includes('429') || e.status === 429) {
          errorMessage = "Gemini API Quota Exceeded. Please try again in a minute.";
      }
      setGameState(prev => ({ 
        ...prev, 
        currentView: 'CHARACTERS', 
        isLoading: false, 
        error: errorMessage 
      }));
    }
  };

  const handleChoice = async (choiceId: string) => {
    setGameState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const nextNode = await continueStory(gameState.storyHistory, choiceId, gameState);
      setGameState(prev => {
        const isEnded = nextNode.choices.length === 0;
        if (isEnded) updateUserStats('completed');
        return {
          ...prev,
          storyHistory: [...prev.storyHistory, nextNode],
          characters: updateCharacters(prev.characters, nextNode.characterUpdates),
          statsHistory: [...prev.statsHistory, nextNode.stats],
          isGameOver: isEnded,
          isLoading: false
        };
      });
    } catch (e: any) {
      let errorMessage = "Failed to continue story. Please try again.";
      if (e.message?.includes('429') || e.status === 429) {
          errorMessage = "Rate limit hit. Please wait a moment.";
      }
      setGameState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      alert(errorMessage);
    }
  };

  const handleSaveStory = () => {
    if (gameState.storyHistory.length === 0) return;
    
    const title = gameState.storyHistory[0].chapterTitle || "Untitled Story";
    const newSave: SavedStory = {
      id: Date.now().toString(),
      title: title.replace('Chapter 1:', '').trim(),
      date: new Date().toLocaleDateString(),
      genre: gameState.selectedGenre!,
      history: gameState.storyHistory,
      characters: gameState.characters,
      statsHistory: gameState.statsHistory,
      gameMode: gameState.gameMode
    };

    const updatedSaves = [newSave, ...savedStories];
    setSavedStories(updatedSaves);
    localStorage.setItem('fableweaver_saves', JSON.stringify(updatedSaves));
    alert("Story saved successfully to Archives!");
  };

  const handleLoadStory = (id: string) => {
    const story = savedStories.find(s => s.id === id);
    if (story) {
      setGameState(prev => ({
        ...prev,
        currentView: 'GAME',
        selectedGenre: story.genre,
        storyHistory: story.history,
        characters: story.characters,
        statsHistory: story.statsHistory,
        gameMode: story.gameMode,
        isGameOver: story.history[story.history.length-1].choices.length === 0
      }));
      setShowArchives(false);
    }
  };

  const handleExport = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - (margin * 2);
    let yPos = 20;

    // Title Page
    doc.setFont("times", "bold");
    doc.setFontSize(24);
    const title = "FableWeaver Story";
    const titleWidth = doc.getTextWidth(title);
    doc.text(title, (pageWidth - titleWidth) / 2, yPos);
    yPos += 20;

    doc.setFontSize(12);
    doc.setFont("times", "normal");

    // Iterate through history
    gameState.storyHistory.forEach((node) => {
       const rawText = node.content;
       
       // Clean up text if linear mode had '## Chapter' markers
       const lines = doc.splitTextToSize(rawText, maxWidth);
       
       // Check page space
       if (yPos + (lines.length * 7) > doc.internal.pageSize.getHeight() - 20) {
           doc.addPage();
           yPos = 20;
       }
       
       // Check if this node starts with a Header (simple heuristic)
       if (node.chapterTitle) {
          doc.setFont("times", "bold");
          doc.setFontSize(16);
          // Only add header if it's not redundant with content
          if (!rawText.startsWith("## " + node.chapterTitle)) {
             doc.text(node.chapterTitle, margin, yPos);
             yPos += 10;
          }
          doc.setFont("times", "normal");
          doc.setFontSize(12);
       }
       
       doc.text(lines, margin, yPos);
       yPos += (lines.length * 6) + 10;
    });

    doc.save(`FableWeaver_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const updateCharacters = (currentChars: Character[], updates: Partial<Character>[]): Character[] => {
    let newChars = [...currentChars];
    updates.forEach(update => {
      const existingIndex = newChars.findIndex(c => c.name === update.name);
      if (existingIndex >= 0) {
        newChars[existingIndex] = { ...newChars[existingIndex], ...update };
      } else if (update.name && update.role && update.affinity !== undefined) {
        newChars.push(update as Character);
      }
    });
    return newChars;
  };

  const handleCharacterChange = (type: 'protagonists' | 'antagonists' | 'support', index: number, value: string) => {
    const list = [...gameState.characterSetup[type]];
    list[index] = value;
    setGameState(prev => ({
        ...prev,
        characterSetup: { ...prev.characterSetup, [type]: list }
    }));
  };

  const addCharacterField = (type: 'protagonists' | 'antagonists' | 'support') => {
    setGameState(prev => ({
        ...prev,
        characterSetup: { ...prev.characterSetup, [type]: [...prev.characterSetup[type], ''] }
    }));
  };

  const removeCharacterField = (type: 'protagonists' | 'antagonists' | 'support', index: number) => {
     const list = [...gameState.characterSetup[type]];
     list.splice(index, 1);
     setGameState(prev => ({
        ...prev,
        characterSetup: { ...prev.characterSetup, [type]: list }
     }));
  };

  // --- RENDERERS ---

  if (gameState.currentView === 'MENU') {
      return (
          <div className="h-screen w-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
             {/* Dynamic Video Game Background */}
             <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-90"></div>
             {/* Reduced overlay opacity from 50% to 20% for brighter look */}
             <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"></div>
             
             <div className="relative z-10 text-center space-y-12">
                 <motion.h1 
                    initial={{ y: -50, opacity: 0 }} 
                    animate={{ y: 0, opacity: 1 }} 
                    transition={{ duration: 1 }}
                    className="text-7xl md:text-9xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-b from-[#e8dcc5] to-[#8b7355] drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] tracking-widest"
                 >
                    FABLEWEAVER
                 </motion.h1>
                 
                 <div className="flex flex-col gap-6 w-64 mx-auto">
                     <button 
                        onClick={() => setGameState(prev => ({ ...prev, currentView: 'MODE_SELECTION' }))}
                        className="group relative px-8 py-4 bg-black/40 backdrop-blur-sm border-2 border-[#8b7355] text-[#e8dcc5] font-serif text-xl tracking-widest uppercase transition-all hover:bg-[#8b7355] hover:text-black"
                     >
                        <div className="absolute inset-0 bg-[#8b7355] transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left -z-10"></div>
                        <span className="flex items-center justify-center gap-2"><Play className="w-5 h-5" /> NEW STORY</span>
                     </button>

                     <button 
                        onClick={() => setShowArchives(true)}
                        className="group relative px-8 py-4 bg-black/40 backdrop-blur-sm border-2 border-[#8b7355] text-[#e8dcc5] font-serif text-xl tracking-widest uppercase transition-all hover:bg-[#8b7355] hover:text-black"
                     >
                        <div className="absolute inset-0 bg-[#8b7355] transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left -z-10"></div>
                        <span className="flex items-center justify-center gap-2"><Archive className="w-5 h-5" /> ARCHIVES</span>
                     </button>
                     
                     <button 
                        onClick={() => setGameState(prev => ({ ...prev, currentView: 'EXIT' }))}
                        className="group relative px-8 py-4 bg-black/40 backdrop-blur-sm border-2 border-[#8b7355]/30 text-[#8b7355]/70 font-serif text-xl tracking-widest uppercase transition-all hover:border-red-900 hover:text-red-500"
                     >
                        <span className="flex items-center justify-center gap-2"><LogOut className="w-5 h-5" /> EXIT</span>
                     </button>
                 </div>
             </div>
             
             <div className="absolute bottom-8 text-[#8b7355]/80 text-xs font-serif tracking-[0.2em] font-bold drop-shadow-md">PRESS START TO BEGIN</div>

             {/* ARCHIVES MODAL - REUSED FOR HOME SCREEN */}
             <AnimatePresence>
                {showArchives && (
                   <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
                      <motion.div 
                        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                        className="w-full max-w-4xl bg-[#1e1e1e] border border-[#8b7355] rounded-sm shadow-2xl max-h-[80vh] flex flex-col"
                      >
                          <div className="p-6 border-b border-[#8b7355]/30 flex justify-between items-center bg-[#2d1b18]">
                              <h2 className="text-2xl text-[#e8dcc5] font-serif tracking-widest flex items-center gap-2">
                                <Archive className="w-6 h-6 text-[#8b7355]" /> STORY ARCHIVES
                              </h2>
                              <button onClick={() => setShowArchives(false)} className="text-[#8b7355] hover:text-[#e8dcc5]"><X className="w-6 h-6"/></button>
                          </div>
                          
                          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                              {savedStories.length === 0 ? (
                                <div className="text-center py-12 text-[#5d4037] font-serif italic text-lg">
                                  No stories archived yet.
                                </div>
                              ) : (
                                savedStories.map((story) => (
                                  <div key={story.id} className="bg-[#0f0b08] border border-[#3e2723] p-4 flex justify-between items-center hover:border-[#8b7355] transition group">
                                      <div>
                                          <h3 className="text-[#e8dcc5] font-serif text-xl font-bold group-hover:text-[#8b7355] transition-colors">{story.title}</h3>
                                          <p className="text-[#a1887f] text-sm font-serif italic">{story.date} • {story.genre.category}</p>
                                      </div>
                                      <button 
                                        onClick={() => handleLoadStory(story.id)}
                                        className="px-6 py-2 bg-[#2d1b18] text-[#e8dcc5] border border-[#3e2723] font-serif hover:bg-[#8b7355] hover:text-black transition uppercase text-sm tracking-widest"
                                      >
                                        Load
                                      </button>
                                  </div>
                                ))
                              )}
                          </div>
                      </motion.div>
                   </div>
                )}
             </AnimatePresence>
          </div>
      );
  }

  if (gameState.currentView === 'MODE_SELECTION') {
    return (
        <div className="h-screen w-screen bg-[#0f0b08] flex items-center justify-center p-8">
            <div className="max-w-5xl w-full">
                <div className="flex items-center justify-between mb-16">
                     <h2 className="text-4xl text-[#e8dcc5] font-serif tracking-widest border-l-4 border-[#8b7355] pl-6">CHOOSE DESTINY</h2>
                     <button onClick={() => setGameState(prev => ({...prev, currentView: 'MENU'}))} className="text-[#8b7355] hover:text-[#e8dcc5] font-serif uppercase tracking-widest">Back</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <button 
                      onClick={() => handleModeSelect('INTERACTIVE')}
                      className="group relative h-96 bg-[#1e1e1e] border border-[#3e2723] hover:border-[#8b7355] transition-all duration-500 rounded-sm overflow-hidden text-left"
                    >
                       <div className="absolute inset-0 bg-black/50 group-hover:bg-black/20 transition duration-500 z-10"></div>
                       <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1542206395-9feb3edaa68d?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center grayscale group-hover:grayscale-0 transition duration-700 opacity-60"></div>
                       
                       <div className="relative z-20 p-8 h-full flex flex-col justify-end">
                          <div className="mb-4 p-3 bg-[#8b7355] w-fit rounded-full text-black group-hover:scale-110 transition-transform duration-300">
                             <MousePointerClick className="w-8 h-8" />
                          </div>
                          <h3 className="text-3xl text-[#e8dcc5] font-serif font-bold mb-2 tracking-wide group-hover:translate-x-2 transition-transform">INTERACTIVE</h3>
                          <p className="text-[#a1887f] font-serif text-lg leading-relaxed group-hover:text-white transition-colors">
                            Forge your own path. Make critical choices that shape the narrative, character relationships, and ending.
                          </p>
                       </div>
                    </button>

                    <button 
                      onClick={() => handleModeSelect('LINEAR')}
                      className="group relative h-96 bg-[#1e1e1e] border border-[#3e2723] hover:border-[#8b7355] transition-all duration-500 rounded-sm overflow-hidden text-left"
                    >
                       <div className="absolute inset-0 bg-black/50 group-hover:bg-black/20 transition duration-500 z-10"></div>
                       <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1532012197267-da84d127e765?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center grayscale group-hover:grayscale-0 transition duration-700 opacity-60"></div>
                       
                       <div className="relative z-20 p-8 h-full flex flex-col justify-end">
                          <div className="mb-4 p-3 bg-[#5d4037] w-fit rounded-full text-[#e8dcc5] group-hover:scale-110 transition-transform duration-300">
                             <BookOpen className="w-8 h-8" />
                          </div>
                          <h3 className="text-3xl text-[#e8dcc5] font-serif font-bold mb-2 tracking-wide group-hover:translate-x-2 transition-transform">LINEAR</h3>
                          <p className="text-[#a1887f] font-serif text-lg leading-relaxed group-hover:text-white transition-colors">
                            Sit back and witness a masterfully crafted tale unfold. The AI weaves the full story before your eyes.
                          </p>
                       </div>
                    </button>
                </div>
            </div>
        </div>
    );
  }

  if (gameState.currentView === 'GENRE') {
    return (
        <div className="h-screen w-screen bg-[#0f0b08] overflow-y-auto custom-scrollbar p-8">
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-12">
                     <h2 className="text-4xl text-[#e8dcc5] font-serif tracking-widest border-l-4 border-[#8b7355] pl-6">SELECT GENRE</h2>
                     <button onClick={() => setGameState(prev => ({...prev, currentView: 'MODE_SELECTION'}))} className="text-[#8b7355] hover:text-[#e8dcc5] font-serif uppercase tracking-widest">Back</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.entries(GENRE_TREE).map(([category, subGenres]) => (
                        <div key={category} className="group bg-[#1e1e1e] border border-[#3e2723] hover:border-[#8b7355] transition-all duration-300 rounded-sm overflow-hidden relative">
                            <div className="p-6 bg-gradient-to-b from-[#2d1b18] to-[#1e1e1e]">
                                <h3 className="text-2xl text-[#e8dcc5] font-serif font-bold mb-4 flex items-center gap-2">
                                    {category === Genre.Fantasy && <Sparkles className="w-5 h-5 text-purple-400"/>}
                                    {category === Genre.Romance && <Heart className="w-5 h-5 text-pink-400"/>}
                                    {category === Genre.Supernatural && <Sparkles className="w-5 h-5 text-blue-400"/>}
                                    {category === Genre.SciFi && <Settings className="w-5 h-5 text-cyan-400"/>}
                                    {category === Genre.Horror && <ShieldAlert className="w-5 h-5 text-red-700"/>}
                                    {category === Genre.Thriller && <Settings className="w-5 h-5 text-green-700"/>}
                                    {category === Genre.Philosophy && <BookOpen className="w-5 h-5 text-slate-400"/>}
                                    {category}
                                </h3>
                                <div className="space-y-2">
                                    {subGenres.map(sub => (
                                        <button 
                                            key={sub}
                                            onClick={() => handleGenreSelect(category as Genre, sub)}
                                            className="w-full text-left px-4 py-2 text-[#a1887f] hover:text-black hover:bg-[#e8dcc5] text-sm font-serif tracking-wide transition-colors rounded-sm flex items-center justify-between group-hover:pl-6"
                                        >
                                            {sub}
                                            <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                                        </button>
                                    ))}
                                    <button 
                                        onClick={() => handleGenreSelect(category as Genre)}
                                        className="w-full text-left px-4 py-2 text-[#8b7355] italic hover:text-[#e8dcc5] text-xs font-serif mt-2"
                                    >
                                        Select Classic {category} &rarr;
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
  }

  if (gameState.currentView === 'CHARACTERS') {
      return (
          <div className="h-screen w-screen bg-[#0f0b08] overflow-y-auto custom-scrollbar flex items-center justify-center p-4">
               <div className="w-full max-w-4xl bg-[#1e1e1e] border border-[#3e2723] rounded-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                   <div className="p-8 border-b border-[#3e2723] bg-[#2d1b18] flex justify-between items-center">
                       <div>
                           <h2 className="text-3xl text-[#e8dcc5] font-serif tracking-widest">ASSEMBLE PARTY</h2>
                           <p className="text-[#a1887f] font-serif italic text-sm mt-1">
                               {gameState.selectedGenre?.category} • {gameState.selectedGenre?.subGenre || 'Classic'}
                           </p>
                       </div>
                       <button onClick={() => setGameState(prev => ({...prev, currentView: 'GENRE'}))} className="text-[#8b7355] hover:text-[#e8dcc5] font-serif uppercase text-xs">Change Genre</button>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                       
                       {/* Protagonists */}
                       <div className="space-y-4">
                           <h3 className="text-[#e8dcc5] font-serif text-lg border-b border-[#8b7355]/30 pb-2 flex items-center gap-2">
                               <Users className="w-5 h-5 text-[#8b7355]" /> Protagonists <span className="text-xs text-[#8b7355]">(Required)</span>
                           </h3>
                           {gameState.characterSetup.protagonists.map((name, i) => (
                               <div key={i} className="flex gap-2">
                                   <input 
                                       type="text" 
                                       value={name}
                                       onChange={(e) => handleCharacterChange('protagonists', i, e.target.value)}
                                       placeholder={`Hero Name #${i+1}`}
                                       className="flex-1 bg-black/30 border border-[#3e2723] text-[#e8dcc5] px-4 py-3 focus:border-[#8b7355] outline-none font-serif"
                                   />
                                   {gameState.characterSetup.protagonists.length > 1 && (
                                       <button onClick={() => removeCharacterField('protagonists', i)} className="text-red-900 hover:text-red-500 px-2"><X className="w-4 h-4" /></button>
                                   )}
                               </div>
                           ))}
                           <button onClick={() => addCharacterField('protagonists')} className="text-[#8b7355] text-sm hover:text-[#e8dcc5] flex items-center gap-1">
                               <UserPlus className="w-4 h-4" /> Add Another Hero
                           </button>
                       </div>

                       {/* Antagonists */}
                       <div className="space-y-4">
                           <h3 className="text-[#e8dcc5] font-serif text-lg border-b border-[#8b7355]/30 pb-2 flex items-center gap-2">
                               <ShieldAlert className="w-5 h-5 text-red-900" /> Antagonists <span className="text-xs text-[#5d4037]">(Optional)</span>
                           </h3>
                           {gameState.characterSetup.antagonists.map((name, i) => (
                               <div key={i} className="flex gap-2">
                                   <input 
                                       type="text" 
                                       value={name}
                                       onChange={(e) => handleCharacterChange('antagonists', i, e.target.value)}
                                       placeholder={`Villain Name #${i+1}`}
                                       className="flex-1 bg-black/30 border border-[#3e2723] text-[#e8dcc5] px-4 py-3 focus:border-[#8b7355] outline-none font-serif"
                                   />
                                   <button onClick={() => removeCharacterField('antagonists', i)} className="text-red-900 hover:text-red-500 px-2"><X className="w-4 h-4" /></button>
                               </div>
                           ))}
                           <button onClick={() => addCharacterField('antagonists')} className="text-[#8b7355] text-sm hover:text-[#e8dcc5] flex items-center gap-1">
                               <UserPlus className="w-4 h-4" /> Add Villain
                           </button>
                       </div>

                       {/* Support */}
                       <div className="space-y-4">
                           <h3 className="text-[#e8dcc5] font-serif text-lg border-b border-[#8b7355]/30 pb-2 flex items-center gap-2">
                               <Users className="w-5 h-5 text-blue-900" /> Support Characters <span className="text-xs text-[#5d4037]">(Optional)</span>
                           </h3>
                           {gameState.characterSetup.support.map((name, i) => (
                               <div key={i} className="flex gap-2">
                                   <input 
                                       type="text" 
                                       value={name}
                                       onChange={(e) => handleCharacterChange('support', i, e.target.value)}
                                       placeholder={`Ally Name #${i+1}`}
                                       className="flex-1 bg-black/30 border border-[#3e2723] text-[#e8dcc5] px-4 py-3 focus:border-[#8b7355] outline-none font-serif"
                                   />
                                   <button onClick={() => removeCharacterField('support', i)} className="text-red-900 hover:text-red-500 px-2"><X className="w-4 h-4" /></button>
                               </div>
                           ))}
                           <button onClick={() => addCharacterField('support')} className="text-[#8b7355] text-sm hover:text-[#e8dcc5] flex items-center gap-1">
                               <UserPlus className="w-4 h-4" /> Add Ally
                           </button>
                       </div>

                       {/* STORY CONFIGURATION */}
                       <div className="space-y-4 pt-8 border-t border-[#8b7355]/30">
                           <h3 className="text-[#e8dcc5] font-serif text-lg border-b border-[#8b7355]/30 pb-2 flex items-center gap-2">
                               <FileText className="w-5 h-5 text-amber-500" /> Story Configuration
                           </h3>
                           
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                               <div className="space-y-2">
                                   <label className="text-[#a1887f] font-serif text-sm block">Story Length (Words)</label>
                                   <div className="flex items-center gap-4">
                                       <input 
                                           type="range" 
                                           min="100" 
                                           max="60000" 
                                           step="100"
                                           value={gameState.storyLength}
                                           onChange={(e) => setGameState(prev => ({ ...prev, storyLength: parseInt(e.target.value) }))}
                                           className="flex-1 accent-[#8b7355]"
                                       />
                                       <input 
                                           type="number"
                                           min="100"
                                           max="60000"
                                           value={gameState.storyLength}
                                           onChange={(e) => setGameState(prev => ({ ...prev, storyLength: Math.min(60000, Math.max(100, parseInt(e.target.value) || 0)) }))}
                                           className="w-24 bg-black/30 border border-[#3e2723] text-[#e8dcc5] px-2 py-1 text-center font-serif focus:border-[#8b7355] outline-none"
                                       />
                                   </div>
                                   <p className="text-xs text-[#5d4037] italic">Range: 100 - 60,000 words.</p>
                               </div>

                               <div className="space-y-2">
                                   <label className="text-[#a1887f] font-serif text-sm block flex items-center gap-2"><AlignLeft className="w-4 h-4"/> Story Description / Plot (Optional)</label>
                                   <textarea 
                                       value={gameState.customPrompt}
                                       onChange={(e) => setGameState(prev => ({ ...prev, customPrompt: e.target.value }))}
                                       placeholder="Describe how the story should progress... (e.g., 'A hero finds a cursed sword but loses his memory.')"
                                       className="w-full h-32 bg-black/30 border border-[#3e2723] text-[#e8dcc5] px-4 py-3 focus:border-[#8b7355] outline-none font-serif resize-none"
                                   />
                               </div>
                           </div>
                       </div>

                   </div>

                   <div className="p-8 border-t border-[#3e2723] bg-[#2d1b18] flex justify-end">
                       <button 
                          onClick={handleStartGame}
                          className="px-12 py-3 bg-[#8b7355] text-black font-serif font-bold tracking-widest uppercase hover:bg-[#e8dcc5] transition shadow-lg"
                       >
                           Begin Journey
                       </button>
                   </div>
               </div>
          </div>
      );
  }

  if (gameState.currentView === 'LOADING') {
      return (
          <div className="h-screen w-screen bg-black flex flex-col items-center justify-center p-8">
               <div className="w-full max-w-2xl space-y-6 text-center">
                   <h2 className="text-[#8b7355] font-serif text-3xl tracking-widest animate-pulse">GENERATING WORLD...</h2>
                   
                   <div className="relative w-full h-4 bg-[#1e1e1e] border border-[#3e2723] rounded-full overflow-hidden">
                       <motion.div 
                          className="absolute top-0 left-0 bottom-0 bg-[#8b7355]"
                          initial={{ width: 0 }}
                          animate={{ width: `${loadingProgress}%` }}
                          transition={{ type: "tween", ease: "linear" }}
                       ></motion.div>
                   </div>
                   
                   <div className="flex justify-between text-[#5d4037] font-serif text-sm">
                       <span>Inscribing destiny...</span>
                       <span className="font-mono">{Math.round(loadingProgress)}%</span>
                   </div>

                   <motion.div 
                     key={currentQuote}
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     className="mt-12 text-[#a1887f] font-serif italic text-lg max-w-lg mx-auto"
                   >
                     {currentQuote}
                   </motion.div>
               </div>
          </div>
      );
  }

  if (gameState.currentView === 'EXIT') {
      return (
          <div className="h-screen w-screen bg-black flex items-center justify-center">
              <div className="text-center space-y-4">
                  <h1 className="text-5xl text-[#e8dcc5] font-serif">FAREWELL</h1>
                  <p className="text-[#8b7355]">The story awaits your return.</p>
                  <button onClick={() => window.location.reload()} className="mt-8 text-sm text-[#3e2723] underline">Reset Cartridge</button>
              </div>
          </div>
      );
  }

  // GAME VIEW
  return (
    <BookLayout 
      currentNode={gameState.storyHistory[gameState.storyHistory.length - 1]}
      storyHistory={gameState.storyHistory}
      characters={gameState.characters}
      currentGenre={gameState.selectedGenre?.category || null}
      onChoice={handleChoice}
      isLoading={gameState.isLoading}
      onExport={handleExport}
      onReset={() => setGameState(INITIAL_STATE)}
      gameMode={gameState.gameMode}
      savedStories={savedStories}
      userStats={userStats}
      onSave={handleSaveStory}
      onLoad={handleLoadStory}
    />
  );
}

export default App;