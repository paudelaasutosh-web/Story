import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Download, LogOut, Bookmark, ChevronLeft, ChevronRight, Menu, Home, Save, PlusCircle, Archive, Trophy, X, FileText } from 'lucide-react';
import { StoryNode, Character, GameMode, SavedStory, UserStats } from '../types';
import Visualizer from './Visualizer';

interface BookLayoutProps {
  currentNode: StoryNode;
  storyHistory?: StoryNode[]; 
  characters: Character[];
  currentGenre: string | null;
  onChoice: (id: string) => void;
  isLoading: boolean;
  onExport: () => void;
  onReset: () => void;
  gameMode?: GameMode;
  children?: React.ReactNode;
  // New Props
  savedStories?: SavedStory[];
  userStats?: UserStats;
  onSave?: () => void;
  onLoad?: (id: string) => void;
}

// Decreased words per page to increase total page count
const WORDS_PER_PAGE = 130;

type PageType = 'TEXT' | 'IMAGE_AND_TEXT' | 'FULL_IMAGE';

interface BookPage {
  id: string;
  type: PageType;
  content: string;
  imagePrompt?: string;
  choices?: any[];
  pageNumber: number;
  chapterTitle?: string;
  isChapterStart?: boolean;
}

const BookLayout: React.FC<BookLayoutProps> = ({ 
  currentNode, 
  storyHistory = [], 
  currentGenre,
  onChoice, 
  isLoading, 
  onExport, 
  onReset,
  characters,
  gameMode = 'INTERACTIVE',
  children,
  savedStories = [],
  userStats = { storiesCreated: 0, storiesCompleted: 0, rankTitle: "Novice" },
  onSave,
  onLoad
}) => {
  const effectiveHistory = storyHistory.length > 0 ? storyHistory : [currentNode];
  
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [showBookmarkMenu, setShowBookmarkMenu] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showArchives, setShowArchives] = useState(false);

  // --- Pagination Logic ---
  const pages = useMemo(() => {
    let generatedPages: BookPage[] = [];
    let globalPageCount = 1;

    effectiveHistory.forEach((node, nodeIndex) => {
      // 1. Visual Page
      if (node.backgroundImagePrompt && (nodeIndex === 0 || gameMode === 'INTERACTIVE')) {
          generatedPages.push({
              id: `${node.id}-visual`,
              type: 'FULL_IMAGE',
              content: '',
              imagePrompt: node.backgroundImagePrompt,
              pageNumber: globalPageCount++,
              chapterTitle: node.chapterTitle
          });
      }

      // 2. Split Content by Chapters (Robust Parsing)
      // Prepend newline to ensure first chapter is caught by regex if it starts with ##
      const rawContent = "\n" + node.content;
      const rawSections = rawContent.split(/\n##\s+/);
      
      const sections = rawSections.map((sectionText, idx) => {
         // Skip empty first section if it resulted from the initial split
         if (idx === 0 && !sectionText.trim()) return null;

         const firstNewLine = sectionText.indexOf('\n');
         let title = "Continued";
         let body = sectionText;
         let isNewChapter = false;

         if (idx > 0 || (idx === 0 && node.content.trim().startsWith('##'))) {
             isNewChapter = true;
             if (firstNewLine !== -1) {
                 title = sectionText.substring(0, firstNewLine).trim();
                 body = sectionText.substring(firstNewLine).trim();
             } else {
                 title = sectionText.trim();
                 body = "";
             }
         } else {
             // Continuation
             title = node.chapterTitle;
             body = sectionText;
         }
         
         // Clean Title (remove residual hashes just in case, though regex split should handle it)
         title = title.replace(/^#+\s*/, '');
         
         return { title, body, isNewChapter };
      }).filter((s): s is { title: string; body: string; isNewChapter: boolean } => s !== null && (s.body.length > 0 || s.isNewChapter));

      sections.forEach((section, sIdx) => {
          const words = section.body.split(' ');
          let currentChunk = [];
          let isFirstPageOfSection = true;

          for (let i = 0; i < words.length; i++) {
            currentChunk.push(words[i]);
            
            // Reduced limit for chapter start pages to allow big title
            const limit = (isFirstPageOfSection && section.isNewChapter) ? WORDS_PER_PAGE - 50 : WORDS_PER_PAGE;

            if (currentChunk.length >= limit) {
                const lastWord = words[i];
                if (lastWord.match(/[.!?]"?$/) || currentChunk.length > limit + 20) {
                   generatedPages.push({
                       id: `${node.id}-sec${sIdx}-pg${globalPageCount}`,
                       type: 'TEXT',
                       content: currentChunk.join(' '),
                       pageNumber: globalPageCount++,
                       chapterTitle: section.title,
                       isChapterStart: isFirstPageOfSection && section.isNewChapter
                   });
                   currentChunk = [];
                   isFirstPageOfSection = false;
                }
            }
          }
          
          if (currentChunk.length > 0 || (isFirstPageOfSection && section.isNewChapter)) {
            const isLastSection = sIdx === sections.length - 1;
            generatedPages.push({
                id: `${node.id}-sec${sIdx}-end`,
                type: 'TEXT',
                content: currentChunk.join(' '),
                pageNumber: globalPageCount++,
                choices: isLastSection ? node.choices : undefined,
                chapterTitle: section.title,
                isChapterStart: isFirstPageOfSection && section.isNewChapter
            });
          }
      });
    });

    if (generatedPages.length % 2 !== 0) {
        generatedPages.push({
            id: 'filler-end',
            type: 'TEXT',
            content: '',
            pageNumber: globalPageCount++,
            chapterTitle: ''
        });
    }

    return generatedPages;
  }, [effectiveHistory, gameMode]);

  useEffect(() => {
      if (gameMode === 'INTERACTIVE') {
          const lastIndex = pages.length > 0 ? (Math.floor((pages.length - 1) / 2) * 2) : 0;
          setCurrentPageIndex(lastIndex);
      } else {
        if (effectiveHistory.length === 1 && pages.length > 2 && currentPageIndex === 0) {
             setCurrentPageIndex(0);
        }
      }
  }, [effectiveHistory.length, gameMode]);

  const handleNextFlip = () => {
    if (currentPageIndex < pages.length - 2) {
      setCurrentPageIndex(prev => prev + 2);
    }
  };

  const handlePrevFlip = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(prev => prev - 2);
    }
  };

  const jumpToPage = (index: number) => {
      const target = index % 2 === 0 ? index : index - 1;
      setCurrentPageIndex(target);
      setShowBookmarkMenu(false);
  };

  const handleCreateNew = () => {
    if (confirm("Create a new story? Unsaved progress in the current story will be lost.")) {
      onReset();
    }
  };

  const renderPageContent = (page: BookPage | undefined, isLeft: boolean) => {
    if (!page) return <div className="w-full h-full bg-[#f4e4bc]"></div>;

    if (page.type === 'FULL_IMAGE') {
        return (
            <div className="w-full h-full p-4 flex items-center justify-center bg-[#1a1a1a] relative overflow-hidden shadow-inner border border-[#d4c5a9]">
                 <Visualizer prompt={page.imagePrompt || ''} genre={currentGenre || 'Fantasy'} />
                 <div className="absolute top-2 left-2 w-8 h-8 border-t-2 border-l-2 border-[#e8dcc5]/50"></div>
                 <div className="absolute bottom-2 right-2 w-8 h-8 border-b-2 border-r-2 border-[#e8dcc5]/50"></div>
            </div>
        );
    }

    // Clean title for display
    const displayTitle = page.chapterTitle ? page.chapterTitle.replace(/Chapter \d+[:.]?/, '').trim() : '';
    const chapterNumStr = page.chapterTitle?.match(/Chapter \d+/)?.[0] || 'Chapter';

    return (
        <div className="flex flex-col h-full relative">
            {/* Header: Only show small header if NOT a chapter start page */}
            <div className="h-8 flex items-center justify-center mb-4">
                {page.chapterTitle && !page.isChapterStart && (
                    <span className="font-serif text-[10px] tracking-[0.2em] text-[#8b7355] uppercase opacity-70">
                        {page.chapterTitle}
                    </span>
                )}
            </div>

            {/* Content Container - Increased bottom padding to avoid page number overlap */}
            <div className="flex-1 prose prose-p:font-serif prose-p:text-[#2d1b18] prose-p:text-lg prose-p:leading-loose prose-p:text-justify prose-p:indent-6 overflow-hidden pb-12">
                {/* CHAPTER TITLE - REDUCED SIZE */}
                {page.isChapterStart && (
                    <div className="flex flex-col items-center justify-center pt-6 mb-6 text-center border-b border-[#8b7355]/30 pb-4">
                         <span className="text-[#8b7355] font-serif uppercase tracking-[0.2em] text-[10px] mb-2">{chapterNumStr}</span>
                         <h1 className="font-serif text-2xl font-bold text-[#3e2723] leading-tight">
                             {displayTitle || page.chapterTitle}
                         </h1>
                    </div>
                )}

                {page.content.split('\n').map((para, i) => {
                    if (para.trim().startsWith('##')) return null; 
                    if (!para.trim()) return null;
                    if (page.isChapterStart && i === 0) {
                        return <p key={i} className="first-letter:text-5xl first-letter:font-bold first-letter:text-[#3e2723] first-letter:float-left first-letter:mr-2 first-letter:mt-[-4px] first-letter:font-serif">{para}</p>;
                    }
                    return <p key={i}>{para}</p>;
                })}
            </div>

            {/* CHOICES */}
            {page.choices && page.choices.length > 0 && !isLoading && (
                 <div className="absolute bottom-12 left-0 right-0 px-8 bg-gradient-to-t from-[#f4e4bc] to-transparent pt-4">
                     <div className="space-y-3">
                         <div className="flex items-center justify-center gap-2 mb-2 opacity-60">
                             <div className="h-[1px] w-12 bg-[#8b7355]"></div>
                             <span className="text-xs font-serif text-[#8b7355] italic">Make your choice</span>
                             <div className="h-[1px] w-12 bg-[#8b7355]"></div>
                         </div>
                         {page.choices.map(choice => (
                             <button
                                key={choice.id}
                                onClick={() => onChoice(choice.id)}
                                className="w-full text-center px-4 py-2 border border-[#8b7355]/40 bg-[#f4e4bc]/80 hover:bg-[#8b7355]/10 hover:border-[#8b7355] rounded-sm transition-all group shadow-sm"
                             >
                                 <span className="font-serif text-[#3e2723] group-hover:text-black italic">{choice.text}</span>
                             </button>
                         ))}
                     </div>
                 </div>
            )}
             {page.choices && page.choices.length > 0 && isLoading && (
                 <div className="absolute bottom-16 left-0 right-0 flex justify-center">
                     <div className="w-6 h-6 border-2 border-[#8b7355] border-t-transparent rounded-full animate-spin"></div>
                 </div>
             )}

            {/* Footer / Page Number */}
            <div className={`absolute bottom-2 ${isLeft ? 'left-2' : 'right-2'} p-2`}>
                <span className="font-serif text-[#5d4037] text-sm font-bold opacity-60">{page.pageNumber}</span>
            </div>
        </div>
    );
  };

  const leftPage = pages[currentPageIndex];
  const rightPage = pages[currentPageIndex + 1];

  return (
    <div className="h-screen w-screen bg-[#1e1e1e] flex items-center justify-center p-4 overflow-hidden relative">
      <div className="absolute inset-0 bg-[#0f0b08] bg-[url('https://www.transparenttextures.com/patterns/dark-wood.png')] opacity-100 pointer-events-none"></div>
      <div className="absolute inset-0 bg-radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.8) 100%) pointer-events-none"></div>

      {/* --- SIDEBAR OVERLAY --- */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="absolute inset-0 bg-black/60 z-50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 left-0 bottom-0 w-80 bg-[#2d1b18] border-r border-[#8b7355] z-50 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-[#8b7355]/30">
                <h2 className="text-2xl font-serif text-[#e8dcc5] tracking-widest flex items-center gap-3">
                  <BookOpen className="w-6 h-6 text-[#8b7355]" />
                  MENU
                </h2>
              </div>

              {/* USER RANKING */}
              <div className="p-6 bg-[#1a0f0d]/50 border-b border-[#8b7355]/30">
                <div className="flex items-center gap-3 mb-2">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <span className="text-[#a1887f] font-serif uppercase text-xs tracking-wider">Your Rank</span>
                </div>
                <h3 className="text-xl text-[#e8dcc5] font-serif font-bold">{userStats.rankTitle}</h3>
                <div className="flex justify-between mt-2 text-xs text-[#8b7355] font-serif">
                  <span>Created: {userStats.storiesCreated}</span>
                  <span>Completed: {userStats.storiesCompleted}</span>
                </div>
              </div>

              {/* OPTIONS */}
              <div className="flex-1 p-6 space-y-2">
                <button onClick={onReset} className="w-full flex items-center gap-3 p-3 text-[#e8dcc5] hover:bg-[#8b7355]/20 rounded transition font-serif text-lg text-left">
                  <Home className="w-5 h-5" /> Home
                </button>
                <button onClick={() => { onSave?.(); setIsSidebarOpen(false); }} className="w-full flex items-center gap-3 p-3 text-[#e8dcc5] hover:bg-[#8b7355]/20 rounded transition font-serif text-lg text-left">
                  <Save className="w-5 h-5" /> Save Story
                </button>
                <button onClick={() => { setShowArchives(true); setIsSidebarOpen(false); }} className="w-full flex items-center gap-3 p-3 text-[#e8dcc5] hover:bg-[#8b7355]/20 rounded transition font-serif text-lg text-left">
                  <Archive className="w-5 h-5" /> Archives
                </button>
                <button onClick={handleCreateNew} className="w-full flex items-center gap-3 p-3 text-[#e8dcc5] hover:bg-[#8b7355]/20 rounded transition font-serif text-lg text-left">
                  <PlusCircle className="w-5 h-5" /> Create New
                </button>
              </div>

              <div className="p-6 border-t border-[#8b7355]/30 text-center">
                <p className="text-[#5d4037] text-xs font-serif italic">FableWeaver AI v1.0</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- ARCHIVES MODAL --- */}
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
                                onClick={() => { onLoad?.(story.id); setShowArchives(false); }}
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

      {/* Top Bar - Modified to include Sidebar Toggle */}
      <div className="absolute top-0 left-0 right-0 p-4 px-8 flex justify-between items-center z-40">
        <div className="flex items-center gap-4">
          <button onClick={() => setIsSidebarOpen(true)} className="text-[#e8dcc5] hover:text-[#8b7355] transition p-2 bg-black/20 rounded-full hover:bg-black/40">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 text-[#e8dcc5] opacity-80">
            <span className="font-serif font-bold tracking-widest text-lg hidden md:block">FableWeaver AI</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onExport} className="p-2 bg-black/30 hover:bg-black/50 border border-[#e8dcc5]/20 rounded-full text-[#e8dcc5] transition backdrop-blur-md flex items-center gap-2" title="Export PDF">
            <Download className="w-4 h-4" /> <span className="text-xs font-serif hidden md:inline">Download PDF</span>
          </button>
          <button onClick={onReset} className="p-2 bg-black/30 hover:bg-red-900/50 border border-[#e8dcc5]/20 rounded-full text-[#e8dcc5] transition backdrop-blur-md" title="End Story">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* BOOK STRUCTURE */}
      <div className="relative w-full max-w-[1400px] aspect-[1.6/1] max-h-[85vh] perspective-2000">
          <div className="absolute inset-0 bg-[#3e2723] rounded-sm shadow-[0_30px_60px_-10px_rgba(0,0,0,0.8)] border-r-4 border-r-[#1a0f0d] flex">
              
              <div className="w-1/2 h-full bg-[#f4e4bc] rounded-l-sm border-r border-[#d4c5a9] relative overflow-hidden">
                   <div className="absolute inset-0 opacity-40 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply"></div>
                   <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-black/10 to-transparent pointer-events-none z-20"></div>
                   <div className="absolute inset-0 p-8 md:p-12 lg:p-16 z-10">
                       <AnimatePresence mode="wait">
                           <motion.div 
                               key={leftPage?.id || 'empty-left'}
                               initial={{ opacity: 0 }}
                               animate={{ opacity: 1 }}
                               exit={{ opacity: 0 }}
                               transition={{ duration: 0.4 }}
                               className="h-full"
                           >
                               {renderPageContent(leftPage, true)}
                           </motion.div>
                       </AnimatePresence>
                   </div>
              </div>

              <div className="w-1/2 h-full bg-[#f4e4bc] rounded-r-sm relative overflow-hidden">
                   <div className="absolute inset-0 opacity-40 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply"></div>
                   <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-black/10 to-transparent pointer-events-none z-20"></div>
                   <div className="absolute inset-0 p-8 md:p-12 lg:p-16 z-10">
                       <AnimatePresence mode="wait">
                           <motion.div 
                               key={rightPage?.id || 'empty-right'}
                               initial={{ opacity: 0 }}
                               animate={{ opacity: 1 }}
                               exit={{ opacity: 0 }}
                               transition={{ duration: 0.4 }}
                               className="h-full"
                           >
                               {renderPageContent(rightPage, false)}
                           </motion.div>
                       </AnimatePresence>
                   </div>
              </div>

              {currentPageIndex > 0 && (
                  <button onClick={handlePrevFlip} className="absolute left-0 top-0 bottom-0 w-16 z-30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-gradient-to-r from-black/20 to-transparent text-[#3e2723] hover:cursor-w-resize"><ChevronLeft className="w-8 h-8 drop-shadow-lg" /></button>
              )}
              {currentPageIndex < pages.length - 2 && (
                  <button onClick={handleNextFlip} className="absolute right-0 top-0 bottom-0 w-16 z-30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-gradient-to-l from-black/20 to-transparent text-[#3e2723] hover:cursor-e-resize"><ChevronRight className="w-8 h-8 drop-shadow-lg" /></button>
              )}
          </div>

          {gameMode === 'LINEAR' && (
              <div className="absolute -right-8 top-12 z-40">
                  <button onClick={() => setShowBookmarkMenu(!showBookmarkMenu)} className="flex items-center gap-1 bg-red-900 text-[#e8dcc5] p-2 pl-4 rounded-r shadow-lg hover:bg-red-800 transition-colors">
                      <Bookmark className="w-5 h-5" />
                  </button>
                  <AnimatePresence>
                  {showBookmarkMenu && (
                      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="absolute right-10 top-0 w-48 bg-[#f4e4bc] border border-[#8b7355] shadow-xl rounded p-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
                          <h4 className="font-serif font-bold text-[#3e2723] mb-2 px-2 border-b border-[#3e2723]/20">Bookmarks</h4>
                          <div className="space-y-1">
                              {pages.map((p, idx) => {
                                  if (p.isChapterStart) {
                                     return (
                                       <button key={p.id} onClick={() => jumpToPage(idx)} className="w-full text-left text-xs font-serif p-2 hover:bg-[#8b7355]/20 rounded text-[#5d4037] truncate">
                                           Pg {p.pageNumber}: {p.chapterTitle}
                                       </button>
                                     );
                                  }
                                  return null;
                              })}
                          </div>
                      </motion.div>
                  )}
                  </AnimatePresence>
              </div>
          )}
      </div>
      
      {children && (
        <div className="hidden xl:flex flex-col w-72 h-[80%] bg-[#4e342e] rounded-lg shadow-2xl relative rotate-2 transform border border-[#3e2723] ml-12">
           <div className="absolute inset-0 rounded-lg opacity-80 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/leather.png')]"></div>
           <div className="absolute top-[10%] -right-2 w-4 h-[80%] border-r-4 border-black/30 rounded-r-lg opacity-50"></div>
           <div className="p-1 relative z-10 h-full overflow-hidden rounded-lg">
             <div className="bg-[#f0e6d2] w-full h-full rounded border border-[#d7ccc8] p-5 overflow-y-auto custom-scrollbar">
                <h2 className="font-serif text-2xl text-[#3e2723] mb-6 border-b-2 border-[#3e2723] pb-2 text-center font-bold tracking-wider">Field Notes</h2>
                {children}
             </div>
           </div>
        </div>
      )}

      <div className="absolute bottom-8 text-[#e8dcc5]/40 text-sm font-serif">
          {gameMode === 'LINEAR' ? 'Use arrow keys or click edges to flip pages.' : 'Make choices to reveal the next pages.'}
      </div>
    </div>
  );
};

export default BookLayout;