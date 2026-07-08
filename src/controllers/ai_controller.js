// src/controllers/ai_controller.js
//
// Proxy de IA. El frontend envía { messages, tools, tool_choice, tier } y este
// controlador enruta a un proveedor según el tier, con respaldo AUTOMÁTICO al
// otro proveedor si el primero falla. Ambas APIs son compatibles con OpenAI.
//
// Las API keys viven SOLO aquí (servidor), nunca en el bundle del frontend.
//
// tier:
//   'fast'   → rondas de decisión de herramientas. Groq 70B primero (rápido y
//              fiable eligiendo herramientas), DeepSeek de respaldo.
//   'strong' → respuesta final ("el cerebro"). DeepSeek primero (más inteligente
//              y menos propenso a inventar), Groq 70B de respaldo.

const axios = require('axios');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

// Modelos por proveedor — overridables por env sin tocar código.
// NOTA: el viejo 8B (llama-3.1-8b-instant) elegía mal las herramientas e inducía
// respuestas incoherentes/inventadas; se retira como modelo por defecto del tier
// 'fast'. Si en producción (DigitalOcean) AI_MODEL_FAST sigue apuntando al 8B,
// actualízalo a 'llama-3.3-70b-versatile' o bórralo para usar este default.
const GROQ_MODEL_FAST = process.env.AI_MODEL_FAST || 'llama-3.3-70b-versatile';
const GROQ_MODEL_STRONG = process.env.AI_MODEL_STRONG || 'llama-3.3-70b-versatile';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

exports.chat = async (req, res) => {
  try {
    const { messages, tools, tool_choice, tier, temperature, max_tokens } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Se requiere un arreglo "messages".' });
    }

    const basePayload = {
      messages,
      temperature: typeof temperature === 'number' ? temperature : 0.2,
      max_tokens: typeof max_tokens === 'number' ? max_tokens : 1800,
    };
    if (Array.isArray(tools) && tools.length) basePayload.tools = tools;
    if (tool_choice) basePayload.tool_choice = tool_choice;

    const groqKey = process.env.GROQ_API_KEY;
    const dsKey = process.env.DEEPSEEK_API_KEY;

    const callGroq = async (model) => {
      const r = await axios.post(
        GROQ_URL,
        { ...basePayload, model },
        { headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' }, timeout: 60000 }
      );
      return { provider: 'groq', model, data: r.data };
    };

    const callDeepSeek = async (model) => {
      const r = await axios.post(
        DEEPSEEK_URL,
        { ...basePayload, model },
        { headers: { Authorization: `Bearer ${dsKey}`, 'Content-Type': 'application/json' }, timeout: 60000 }
      );
      return { provider: 'deepseek', model, data: r.data };
    };

    // Orden de intento según el tier. Cada proveedor solo se intenta si su key existe.
    //   strong → DeepSeek primero (cerebro), Groq 70B de respaldo.
    //   fast   → Groq 70B primero (orquestación), DeepSeek de respaldo.
    const attempts = (tier === 'strong'
      ? [dsKey && (() => callDeepSeek(DEEPSEEK_MODEL)), groqKey && (() => callGroq(GROQ_MODEL_STRONG))]
      : [groqKey && (() => callGroq(GROQ_MODEL_FAST)), dsKey && (() => callDeepSeek(DEEPSEEK_MODEL))]
    ).filter(Boolean);

    if (!attempts.length) {
      return res
        .status(502)
        .json({ error: 'No hay proveedor de IA configurado (define GROQ_API_KEY o DEEPSEEK_API_KEY).' });
    }

    for (const attempt of attempts) {
      try {
        const { provider, model, data } = await attempt();
        return res.status(200).json({ provider, model, ...data });
      } catch (err) {
        console.error(
          '[ai] proveedor falló:',
          err?.response?.status,
          err?.response?.data?.error?.message || err.message
        );
        // intenta el siguiente proveedor
      }
    }

    return res.status(502).json({ error: 'Error consultando el modelo de IA (todos los proveedores fallaron).' });
  } catch (error) {
    console.error('[ai] chat error:', error?.response?.data || error.message);
    return res.status(502).json({ error: 'Error consultando el modelo de IA.' });
  }
};
