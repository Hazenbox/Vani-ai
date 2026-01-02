import { GoogleGenerativeAI } from "@google/generative-ai";
import { FactKnowledgeGraph, SemanticExtraction } from "../types";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Stage 1: Contextual Crawling & Denoising
const EXTRACTION_PROMPT = `
You are a semantic web content extractor. Analyze this URL and extract ONLY the main content.

IGNORE (Low-Saliency):
- Navigation menus, headers, footers
- Advertisements, "Related articles", "You may also like"
- Cookie banners, pop-ups, subscription forms
- Comments sections, social media widgets

FOCUS ON (High-Saliency):
- Main article body / primary content
- Factual information (names, dates, numbers, events)
- Core narrative or explanation

URL: {url}

Extract and return JSON:
{
  "cleanedText": "Main content only, no noise",
  "primaryTopic": "What is this about?",
  "contentType": "article|wikipedia|news|blog",
  "confidence": 0.95
}
`;

// Stage 2: Fact Clustering (Knowledge Graph)
const FACT_CLUSTERING_PROMPT = `
You are a fact extraction expert. Analyze this content and extract structured facts.

Create a knowledge graph with:
- ENTITIES: People, places, organizations, teams
- QUANTITIES: Numbers with context (5 titles, $1.3B, 87%)
- DATES: Years, specific dates with events
- EVENTS: Key happenings (Won championship, Launched product)
- RELATIONS: Connections between entities (subject-predicate-object)

Content:
{content}

Return JSON with this exact structure:
{
  "entities": [{"type": "entity", "value": "Mumbai Indians", "context": "IPL cricket team"}],
  "quantities": [{"type": "quantity", "value": "5", "context": "IPL titles won"}],
  "dates": [{"type": "date", "value": "2008", "context": "First IPL season"}],
  "events": [{"type": "event", "value": "Won IPL Final", "context": "May 2020"}],
  "relations": [{"subject": "Mumbai Indians", "predicate": "won", "object": "5 IPL titles", "confidence": 1.0}]
}
`;

/**
 * Extract semantic content from URL using 2-stage pipeline:
 * 1. Denoise: Remove ads, navigation, extract clean content
 * 2. Cluster: Build knowledge graph of entities, facts, relations
 */
export async function extractSemanticContent(url: string): Promise<SemanticExtraction> {
  const startTime = Date.now();
  
  console.log('🔍 Stage 1: Extracting clean content from URL...');
  
  // Stage 1: Denoise and extract clean content
  const cleanContentResult = await geminiModel.generateContent({
    contents: [{ role: "user", parts: [{ text: EXTRACTION_PROMPT.replace("{url}", url) }] }],
    generationConfig: { 
      responseMimeType: "application/json",
      temperature: 0.3  // Lower temperature for factual extraction
    }
  });
  
  const cleanContent = JSON.parse(cleanContentResult.response.text());
  console.log(`✅ Extracted ${cleanContent.cleanedText.length} chars, topic: ${cleanContent.primaryTopic}`);
  
  console.log('🔍 Stage 2: Clustering facts into knowledge graph...');
  
  // Stage 2: Cluster facts into knowledge graph
  const factsResult = await geminiModel.generateContent({
    contents: [{ role: "user", parts: [{ text: FACT_CLUSTERING_PROMPT.replace("{content}", cleanContent.cleanedText) }] }],
    generationConfig: { 
      responseMimeType: "application/json",
      temperature: 0.3
    }
  });
  
  const facts: FactKnowledgeGraph = JSON.parse(factsResult.response.text());
  
  const extractionTime = Date.now() - startTime;
  console.log(`✅ Extracted ${facts.entities?.length || 0} entities, ${facts.quantities?.length || 0} quantities in ${extractionTime}ms`);
  
  return {
    cleanedText: cleanContent.cleanedText,
    facts: facts,
    extractionTime: extractionTime,
    sourceQuality: cleanContent.confidence || 0.8
  };
}

/**
 * Format extracted facts for script generation prompt
 */
export function formatFactsForPrompt(facts: FactKnowledgeGraph): string {
  const entities = (facts.entities || []).map(e => `${e.value} (${e.context || 'unknown'})`).join(', ');
  const quantities = (facts.quantities || []).map(q => `${q.value} ${q.context || ''}`).join(', ');
  const dates = (facts.dates || []).map(d => `${d.value} (${d.context || ''})`).join(', ');
  
  let formatted = '';
  if (entities) formatted += `ENTITIES: ${entities}\n`;
  if (quantities) formatted += `NUMBERS: ${quantities}\n`;
  if (dates) formatted += `DATES: ${dates}\n`;
  
  if (facts.relations && facts.relations.length > 0) {
    formatted += `\nKEY FACTS:\n`;
    facts.relations.forEach(rel => {
      formatted += `- ${rel.subject} ${rel.predicate} ${rel.object}\n`;
    });
  }
  
  return formatted || 'No structured facts extracted.';
}
