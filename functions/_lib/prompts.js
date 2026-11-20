// Prompt categories, Gemini system prompt builder, and fallback generator

export const CATEGORIES = [
  {
    key: '3d',
    n: 'مجسم 3D',
    len: '60 to 120 words in one paragraph',
    g: "Target: text-to-3D and image-to-3D generators (Meshy, Tripo, Rodin, Hunyuan3D). Describe object, shape and proportions, key parts, materials, surface detail, colors, orientation. Single clean object, plain neutral background, centered, front three-quarter view, soft even lighting. For 3D printing add: solid watertight geometry, no floating parts, thick enough features, flat stable base. End with a new line 'Negative prompt:' and a short comma-separated avoid list."
  },
  {
    key: 'image',
    n: 'صورة',
    len: '60 to 130 words in one paragraph',
    g: "Target: Midjourney, DALL-E, Flux, Stable Diffusion, Ideogram. Cover subject, action, setting, composition and framing, camera and lens (for photos), lighting, color palette, mood, texture, quality descriptors. Put any text that must appear inside the image in quotes. End with a new line 'Negative prompt:' (short avoid list) and a new line 'Aspect ratio:' with the chosen ratio."
  },
  {
    key: 'video',
    n: 'فيديو',
    len: '80 to 160 words, shot by shot if useful',
    g: 'Target: Veo, Sora, Runway, Kling, Pika. Describe the scene, subject and action in time order, camera movement (dolly, pan, orbit, handheld), shot type, lighting, color grade, pacing, and ambient audio or music cues if relevant. Mention duration and aspect ratio at the end.'
  },
  {
    key: 'game',
    n: 'برمجة لعبة',
    len: '150 to 300 words, structured as short labeled sections',
    g: 'Target: a coding AI assistant (Claude, ChatGPT, Cursor). Write a clear build brief with labeled sections: Goal, Core gameplay loop, Mechanics and controls, Entities and rules, Scoring and progression, UI/HUD, Art and audio placeholders, Project structure, Acceptance criteria. Ask the assistant to deliver complete runnable code with brief setup steps.'
  },
  {
    key: 'song',
    n: 'أغنية',
    len: '50 to 100 words for the style prompt, plus lyrics if requested',
    g: "Target: Suno, Udio. Output two parts. Part 1 'Style prompt:' with genre tags, mood, tempo in BPM, key instruments, vocal character, production style. Part 2 'Lyrics:' with section tags like [Verse], [Chorus], [Bridge] and original lyrics in the chosen lyrics language (skip if none or instrumental)."
  },
  {
    key: 'app',
    n: 'تطبيق / موقع',
    len: '150 to 300 words, structured as short labeled sections',
    g: 'Target: a coding AI assistant. Write a build brief with labeled sections: Goal, Users, Features, Pages or screens, Data model, UX and design notes (RTL Arabic support if relevant), Tech stack, Edge cases, Acceptance criteria. Ask for complete working code and run instructions.'
  },
  {
    key: 'write',
    n: 'كتابة',
    len: '60 to 140 words',
    g: 'Target: a chat LLM. Write a prompt with role, task, audience, tone, structure, length, constraints, and the requested output language for the final text.'
  },
  {
    key: 'voice',
    n: 'تعليق صوتي',
    len: 'voice direction of 40 to 80 words, followed by the full script sized to the chosen duration',
    g: "Target: AI voice generators and text-to-speech tools (ElevenLabs, OpenAI TTS, Murf, Play.ht). Decide the voice-over language from the user idea: if the idea names a language use it, otherwise use the language the idea is written in. Write the voice direction in English (tone, pace, emotion, age range, accent, pauses, delivery notes) and apply the chosen voice, echo and duration. Then include the full voice-over script in the decided language, sized to the duration and never longer than 3 minutes. Format: a line 'Language:', a line 'Voice direction:', a line 'Echo:', then 'Script:' followed by the script. The script is the only part that is not in English unless the decided language is English."
  },
  {
    key: 'other',
    n: 'أي شيء آخر',
    len: '60 to 200 words',
    g: 'Infer the best prompt format for the kind of output and the tool named (if any). Make it specific, structured and ready to paste.'
  }
];

export function buildGeminiPrompt({ catIndex, idea, mode, settings, hasImage }) {
  const cat = CATEGORIES[catIndex] || CATEGORIES[8];
  const setLines = (settings || [])
    .filter((s) => s && s.label && s.value)
    .map((s) => `- ${s.label}: ${s.value}`)
    .join('\n');

  return [
    'You are an expert prompt engineer for generative AI tools.',
    'Turn the user idea below (may be Arabic or any language) into ONE professional, ready-to-paste English prompt.',
    `Type: ${cat.n} (${cat.g})`,
    setLines ? `User settings:\n${setLines}` : '',
    `Input mode: ${
      mode
        ? 'the input is already a prompt written by the user. Keep every detail, number, name and constraint exactly, translate and restructure it into the professional format, and add only technical quality terms that help the tool; do not add new creative content.'
        : 'the input is a short idea. Expand it into the best complete prompt, adding sensible professional details without changing the core idea.'
    }`,
    'Rules:',
    `- Be specific and concrete; never invent details that contradict the idea${
      hasImage
        ? ' or the attached reference image; describe what the image shows and merge it with the idea'
        : ''
    }.`,
    `- Length: ${cat.len}.`,
    '- Output ONLY the prompt text, in English, with no preface and no markdown code fences.',
    '',
    'User idea:',
    idea
  ]
    .filter(Boolean)
    .join('\n');
}

function detectLang(s) {
  if (/english|انجليز|إنجليز/i.test(s)) return 'English';
  if (/[\u0600-\u06FF]/.test(s)) return 'Arabic';
  return 'English';
}

async function translateArabicToEnglish(text) {
  if (!/[\u0600-\u06FF]/.test(text)) return text;
  const parts = text.match(/[^.!\u061f?\n]+[.!\u061f?]*/g) || [text];
  const chunks = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > 450) {
      if (cur) chunks.push(cur);
      cur = p;
    } else {
      cur += p;
    }
  }
  if (cur) chunks.push(cur);

  const out = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=ar|en`
        );
        const j = await res.json();
        const t = j && j.responseData && j.responseData.translatedText;
        return t && !/MYMEMORY WARNING/i.test(t) ? t : chunk;
      } catch {
        return chunk;
      }
    })
  );
  return out.join(' ').trim();
}

export async function fallbackGenerate({ catIndex, idea, mode, settings }) {
  const en = (await translateArabicToEnglish(idea)).replace(/[.\s]+$/, '');
  const vals = (settings || []).map((s) => s.value).filter(Boolean);

  if (mode === 1) {
    return vals.length ? `${en}.\nSettings: ${vals.join(', ')}.` : `${en}.`;
  }

  switch (catIndex) {
    case 0:
      return `A ${en}, ${vals[1] || 'realistic'} style, designed for ${vals[0] || 'general 3D render'}. Single centered object on a plain neutral background, front three-quarter view, soft even studio lighting, accurate proportions, fine surface detail, clean topology.${
        /printing/.test(vals[0] || '')
          ? ' Solid watertight geometry, no floating parts, thick enough features, flat stable base.'
          : ''
      }\nNegative prompt: blurry, noisy mesh, broken geometry, floating parts, text, watermark, background clutter`;
    case 1:
      return `${en}, ${vals[0] || 'photorealistic photography'}, detailed composition, balanced framing, professional lighting, rich color palette, sharp focus, high resolution.\nNegative prompt: blurry, low quality, distorted, extra limbs, text artifacts, watermark\nAspect ratio: ${vals[1] || '16:9 wide'}`;
    case 2:
      return `${vals[0] || 'cinematic realistic'} video, ${vals[1] || '5 seconds'}, ${vals[2] || '16:9 wide'}. ${en}. Smooth camera movement, dynamic lighting, cinematic color grade, natural motion, consistent subject, high detail, polished pacing.`;
    case 3:
      return `Build a ${vals[1] || '2D'} game in ${vals[0] || 'HTML5 + JavaScript, single file'}: ${en}.\nSections to cover:\n- Goal and core gameplay loop with clear win and lose conditions\n- Player controls and responsive input\n- Entities, obstacles and rules\n- Scoring, levels and difficulty progression\n- UI/HUD, menu and restart flow\n- Clean project structure with comments\nDeliver complete runnable code and short setup steps.`;
    case 4:
      return `Style prompt: ${vals[0] || 'pop'}, ${vals[1] || 'male vocals'}, emotional and catchy, modern production, clear mix, strong hook, tempo around 100 BPM. Theme: ${en}.\nLyrics language: ${vals[2] || 'Arabic'}.\nStructure: [Intro] [Verse 1] [Chorus] [Verse 2] [Chorus] [Bridge] [Final Chorus] [Outro]`;
    case 5:
      return `Build an app using ${vals[0] || 'HTML, CSS and vanilla JavaScript'}: ${en}.\nSections to cover:\n- Goal and target users\n- Core features and screens\n- Data model\n- UX and design notes, RTL Arabic support if relevant\n- Edge cases and error handling\n- Acceptance criteria\nDeliver complete working code and run instructions.`;
    case 6:
      return `Act as a professional writer. Write: ${en}.\nTone: ${vals[0] || 'professional'}. Output language: ${vals[1] || 'Arabic'}. Use a clear structure, an engaging opening, concise sentences, and no filler.`;
    case 7: {
      const L = detectLang(idea);
      return `Voice-over: ${en}.\nLanguage: ${L}.\nVoice direction: ${vals[0] || 'male voice'}, clear and natural, professional broadcast quality, well-paced delivery with natural pauses and emotion that fits the content.\nDuration: ${vals[1] || '30 seconds, about 70 words'}.\nEcho: ${vals[2] || 'no echo, dry clean voice'}.\nWrite the full script in ${L} sized to the duration (never longer than 3 minutes), then deliver it in this voice, ready for a text-to-speech tool.`;
    }
    default:
      return `${en}.\nBe specific, well structured and detailed. State the goal, audience, format, style, constraints and expected output.`;
  }
}
