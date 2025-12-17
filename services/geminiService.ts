import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Genre, StoryNode, Character, GameState, GenreOption, CharacterSetupData, GameMode } from '../types';

// Ensure API Key is available
const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    chapterTitle: { type: Type.STRING },
    content: { type: Type.STRING },
    summary: { type: Type.STRING, description: "A summary of this event." },
    choices: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          text: { type: Type.STRING },
          tone: { type: Type.STRING, enum: ['brave', 'cautious', 'witty', 'romantic', 'aggressive', 'neutral'] }
        },
        required: ['id', 'text', 'tone']
      }
    },
    characterUpdates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          role: { type: Type.STRING },
          affinity: { type: Type.NUMBER, description: "New affinity score 0-100" },
          status: { type: Type.STRING },
          description: { type: Type.STRING }
        }
      }
    },
    stats: {
      type: Type.OBJECT,
      properties: {
        tension: { type: Type.NUMBER },
        mystery: { type: Type.NUMBER },
        romance: { type: Type.NUMBER },
        hope: { type: Type.NUMBER }
      },
      required: ['tension', 'mystery', 'romance', 'hope']
    },
    backgroundImagePrompt: { type: Type.STRING, description: "A detailed, atmospheric black and white visual description of the current scene." }
  },
  required: ['chapterTitle', 'content', 'choices', 'characterUpdates', 'stats', 'summary', 'backgroundImagePrompt']
};

/**
 * Helper function to retry Gemini API calls on 429 (Rate Limit) or 503 (Overload) errors.
 * Implements exponential backoff.
 */
const generateWithRetry = async (params: any, retries = 5, initialDelay = 2000) => {
  let attempt = 0;
  let delay = initialDelay;

  while (attempt <= retries) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      // Check for Rate Limit (429) or Server Errors (500, 503)
      const isQuota = error.status === 429 || error.code === 429 || (error.message && error.message.includes('429')) || (error.message && error.message.includes('quota'));
      const isServer = error.status === 503 || error.code === 503 || error.status === 500 || error.code === 500;

      if ((isQuota || isServer) && attempt < retries) {
        console.warn(`Gemini API Error ${error.status || error.code} (Attempt ${attempt + 1}/${retries + 1}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        attempt++;
      } else {
        throw error;
      }
    }
  }
  throw new Error("Gemini API Request failed after maximum retries.");
};

export const startStory = async (
  genreOption: GenreOption, 
  chars: CharacterSetupData, 
  mode: GameMode,
  storyLength: number = 5000,
  customPrompt: string = ""
): Promise<StoryNode> => {
  
  const protagonistsList = chars.protagonists.join(', ');
  const antagonistsList = chars.antagonists.length > 0 ? chars.antagonists.join(', ') : "Unknown forces";
  const supportList = chars.support.length > 0 ? chars.support.join(', ') : "None initially";
  const setting = genreOption.subGenre ? `specifically set in a ${genreOption.subGenre} setting` : "";
  const userPlotGuidance = customPrompt ? `\nUSER PLOT GUIDANCE: ${customPrompt}\nFollow this guidance strictly.` : "";

  const isLinear = mode === 'LINEAR';
  
  if (!isLinear) {
    // --- INTERACTIVE MODE (Original Logic) ---
    const prompt = `
      Start a new interactive text adventure in the ${genreOption.category} genre, ${setting}.
      
      CAST:
      - Protagonist(s): ${protagonistsList}
      - Antagonist(s): ${antagonistsList}
      - Supporting Character(s): ${supportList}
      
      ${userPlotGuidance}

      INSTRUCTIONS:
      1. Introduce the protagonists and the immediate conflict.
      2. Incorporate the chosen setting/sub-genre flavor strongly.
      3. Write Chapter 1. Keep it roughly 300 words long to allow for frequent user choices.
      4. Offer 2-4 distinct choices for the user to influence the plot.
      
      Output strictly in the requested JSON format.
    `;

    try {
      // Use retry wrapper
      const response = await generateWithRetry({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          systemInstruction: "You are an expert interactive fiction writer. Visuals must be black and white / noir.",
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");
      
      const data = JSON.parse(text) as StoryNode;
      data.id = 'root'; 
      return data;
    } catch (error) {
      console.error("Failed to start story:", error);
      throw error;
    }
  } else {
    // --- LINEAR MODE (Dynamic Length) ---
    
    // REDUCED BATCH SIZE TO PREVENT 500 TIMEOUTS
    // 1000 words is a safe limit for a single generated response with JSON schema.
    const wordsPerBatch = 1000;
    const totalBatches = Math.max(1, Math.ceil(storyLength / wordsPerBatch));
    
    let fullStoryContent = "";
    let finalStats = { tension: 50, mystery: 50, romance: 50, hope: 50 };
    let finalCharUpdates: Partial<Character>[] = [];
    let firstImagePrompt = "";
    let overallTitle = `The ${genreOption.category} of ${chars.protagonists[0]}`;

    // Generate Dynamic Batch Prompts
    const batchPrompts = [];
    
    if (totalBatches === 1) {
        batchPrompts.push({ 
            range: "Full Story", 
            instruction: `Write the COMPLETE story in one response. Target approximately ${storyLength} words. Structure it with appropriate chapters.` 
        });
    } else {
        for (let i = 0; i < totalBatches; i++) {
            let partType = "Middle Part";
            let instruction = "Continue the story, deepening the plot and developing character arcs.";
            
            if (i === 0) {
                partType = "The Beginning";
                instruction = "Establish the world, introduce characters, and trigger the inciting incident.";
            } else if (i === totalBatches - 1) {
                partType = "The Conclusion";
                instruction = "Bring the story to a satisfying climax and resolution. Tie up all loose ends.";
            } else if (i === Math.floor(totalBatches / 2)) {
                 partType = "The Midpoint";
                 instruction = "A major turning point, revelation, or point of no return.";
            } else if (i === totalBatches - 2) {
                 partType = "The Climax Begins";
                 instruction = "The point of highest tension. The final confrontation draws near.";
            }

            batchPrompts.push({
                range: `Part ${i+1}/${totalBatches}: ${partType}`,
                instruction: `${instruction} Write approximately ${wordsPerBatch} words for this section.`
            });
        }
    }

    let previousSummary = "None yet.";

    for (const batch of batchPrompts) {
      const prompt = `
        You are writing a story in the ${genreOption.category} genre, ${setting}.
        TARGET TOTAL LENGTH: ${storyLength} words.
        
        CAST:
        - Protagonist(s): ${protagonistsList}
        - Antagonist(s): ${antagonistsList}
        - Supporting Character(s): ${supportList}

        ${userPlotGuidance}
        
        CURRENT TASK: Write ${batch.range}.
        CONTEXT SO FAR: ${previousSummary}
        
        INSTRUCTIONS:
        1. Write engaging prose.
        2. ${batch.instruction}
        3. Structure the output with '## Chapter X: Title' headers for each chapter if the section is long enough.
        4. Return an EMPTY array [] for 'choices'.
        5. Do not summarize in the content field. Describe sensory details, dialogue, and inner thoughts.
        
        Output strictly in the requested JSON format.
      `;

      try {
        // Use retry wrapper
        const response = await generateWithRetry({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            systemInstruction: "You are a best-selling author. Write extensive, immersive content.",
          }
        });

        const text = response.text;
        if (text) {
          const data = JSON.parse(text) as StoryNode;
          
          fullStoryContent += (fullStoryContent ? "\n\n" : "") + data.content;
          
          finalStats = data.stats;
          finalCharUpdates = data.characterUpdates;
          previousSummary = data.summary; 
          
          if (!firstImagePrompt) {
            firstImagePrompt = data.backgroundImagePrompt || "A mysterious scene in black and white";
            overallTitle = data.chapterTitle || overallTitle;
          }
        }
      } catch (e) {
        console.error("Error in batch generation:", e);
        // Continue with what we have if a batch fails, or throw if it's the first one
        if (!fullStoryContent) throw e;
      }
    }

    const finalNode: StoryNode = {
      id: 'root-linear-full',
      chapterTitle: overallTitle,
      content: fullStoryContent,
      choices: [], 
      characterUpdates: finalCharUpdates,
      stats: finalStats,
      summary: `A complete ${storyLength} word story.`,
      backgroundImagePrompt: firstImagePrompt
    };
    
    return finalNode;
  }
};

export const continueStory = async (
  history: StoryNode[], 
  choiceId: string, 
  currentState: GameState
): Promise<StoryNode> => {
  const lastNode = history[history.length - 1];
  const selectedChoice = lastNode.choices.find(c => c.id === choiceId);
  const choiceText = selectedChoice ? selectedChoice.text : "Continue...";

  const recentHistory = history.slice(-3).map(n => `Chapter: ${n.chapterTitle}\nSummary: ${n.summary}`).join('\n');
  const characterContext = currentState.characters.map(c => `${c.name} (${c.role}): Status=${c.status}, Affinity=${c.affinity}`).join('\n');
  
  const turnCount = history.length;
  
  const lengthInstruction = "Write approx 250-400 words. Enough for a significant scene but short enough for frequent interaction.";

  let pacingInstruction = "Advance the plot. Maintain good pacing.";
  
  const MAX_TURNS = 20; 

  if (turnCount >= MAX_TURNS) {
    pacingInstruction = `
      This is the ABSOLUTE FINAL part of the story. 
      You MUST conclude the narrative now. 
      Return an empty array [] for "choices" to signal the end.
    `;
  }

  const prompt = `
    Continue the story based on the user's choice: "${choiceText}".
    
    Instruction: ${pacingInstruction}
    Length: ${lengthInstruction}
    Offer 2-4 new distinct choices.
    
    Recent Context:
    ${recentHistory}
    
    Current Characters:
    ${characterContext}
    
    Requirements:
    1. Update character relationships based on the choice.
    2. Ensure 'backgroundImagePrompt' is vivid, cinematic, and specified as black and white.
  `;

  try {
    // Use retry wrapper
    const response = await generateWithRetry({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        systemInstruction: "You are an expert interactive fiction writer. Visuals must be black and white / noir.",
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const data = JSON.parse(text) as StoryNode;
    data.id = `${lastNode.id}-${choiceId}`;
    return data;
  } catch (error) {
    console.error("Failed to continue story:", error);
    throw error;
  }
};