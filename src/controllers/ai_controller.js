// src/controllers/ai_controller.js
//
// Proxy de IA. El frontend envía { messages, tools, tool_choice, tier } y este
// controlador elige el modelo según el tier (auto-ruteo) y reenvía la petición a
// Groq (API compatible con OpenAI), con fallback a DeepSeek si Groq falla.
//
// Las API keys viven SOLO aquí (servidor), nunca en el bundle del frontend.
//
// tier:
//   'fast'   → modelo rápido/barato para las rondas de decisión de herramientas.
//   'strong' → modelo potente para la respuesta final (mejor razonamiento).

const axios = require('axios');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// Modelos por tier — overridables por env sin tocar código.
const MODELS = {
  fast: process.env.AI_MODEL_FAST || 'llama-3.1-8b-instant',
  strong: process.env.AI_MODEL_STRONG || 'llama-3.3-70b-versatile',
};
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

exports.chat = async (req, res) => {
  try {
    const { messages, tools, tool_choice, tier, temperature, max_tokens } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Se requiere un arreglo "messages".' });
    }

    const model = tier === 'strong' ? MODELS.strong : MODELS.fast;

    const payload = {
      model,
      messages,
      temperature: typeof temperature === 'number' ? temperature : 0.2,
      max_tokens: typeof max_tokens === 'number' ? max_tokens : 1000,
    };
    if (Array.isArray(tools) && tools.length) payload.tools = tools;
    if (tool_choice) payload.tool_choice = tool_choice;

    const groqKey = process.env.GROQ_API_KEY;

    // 1) Groq primero
    if (groqKey) {
      try {
        const r = await axios.post(GROQ_URL, payload, {
          headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          timeout: 60000,
        });
        return res.status(200).json({ provider: 'groq', model, ...r.data });
      } catch (groqErr) {
        console.error(
          '[ai] Groq falló:',
          groqErr?.response?.status,
          groqErr?.response?.data?.error?.message || groqErr.message
        );
        // continúa al fallback de DeepSeek
      }
    }

    // 2) Fallback: DeepSeek
    const dsKey = process.env.DEEPSEEK_API_KEY;
    if (dsKey) {
      const r2 = await axios.post(
        DEEPSEEK_URL,
        { ...payload, model: DEEPSEEK_MODEL },
        {
          headers: { Authorization: `Bearer ${dsKey}`, 'Content-Type': 'application/json' },
          timeout: 60000,
        }
      );
      return res.status(200).json({ provider: 'deepseek', model: DEEPSEEK_MODEL, ...r2.data });
    }

    return res
      .status(502)
      .json({ error: 'No hay proveedor de IA configurado (define GROQ_API_KEY o DEEPSEEK_API_KEY).' });
  } catch (error) {
    console.error('[ai] chat error:', error?.response?.data || error.message);
    return res.status(502).json({ error: 'Error consultando el modelo de IA.' });
  }
};
