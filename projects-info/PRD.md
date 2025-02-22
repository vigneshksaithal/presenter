# Presenter — AI Presentation Builder

**Hackathon**: ElevenLabs x a16z WW  
**Track**: AI Agents (ElevenLabs Prize)  

---

## Core Objectives

Create an AI presentation tool that:

- Generates slides from PDFs/URLs using GPT-4
- Adds ElevenLabs voice narration
- Answers live Q&A with document context
- Integrates ElevenLabs/PostHog/Vercel for judging

---

## Tech Stack

| Category       | Tools                          |  
|----------------|--------------------------------|  
| **Frontend**   | Svelte 5, Tailwind, PicoCSS    |  
| **APIs**       | ElevenLabs, GPT-4, PostHog     |  
| **Libraries**  | pdf-parse, svelte-dnd-action   |  

---

## Key Features

### 1. File Processing (5s max)

- Drag-n-drop PDF/URL → Text extraction
- `pdf-parse` + `cheerio` for content mining

### 2. AI Slide Generation (30s max) 

- GPT-4 structuring → SvelteKit API routes
- 5+ slides with Tailwind/PicoCSS layouts

### 3. Voice Narration 

- ElevenLabs sync → Slide transitions
- Voice selector dropdown UI

### 4. Live Document Q&A 

- ChatGPT API → Chat interface
- <10s response time

### 5. Judging Requirements

- PostHog tracking → Public dashboard
- Vercel deployment proof

---

## User Flow

1. Upload → 2. AI Processing → 3. Present  
(Edit/voice/q&a in single view)

---

## Success Metrics

- 3+ sponsor APIs integrated
- Live Q&A + voice narration demo
- Enterprise/education use case
