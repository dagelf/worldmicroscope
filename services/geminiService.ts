import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Using a lighter model for "live-ish" analysis
const MODEL_NAME = "gemini-2.5-flash";

export const analyzeMicroscopeFrame = async (base64Image: string): Promise<AnalysisResponse | null> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image,
            },
          },
          {
            text: `Analyze this microscope slide image for a scientific application. 
            Identify biological structures, cells, or microorganisms. 
            Provide a list of entities found with scientific names, a brief description, confidence level (0-1), and relevant tags (e.g., 'prokaryote', 'stained', 'nucleus').
            Also provide a short structural note about the texture/morphology.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            entities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
              },
            },
            structuralNotes: { type: Type.STRING },
            depthMapHint: { type: Type.STRING, description: "A brief description of the 3D depth perception (e.g., 'Flat', 'Spherical object in center', 'Fibrous layers')" },
          },
        },
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as AnalysisResponse;
    }
    return null;
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return null;
  }
};
