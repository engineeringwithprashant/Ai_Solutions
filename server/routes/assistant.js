const express = require('express');
const router  = express.Router();
const OpenAI  = require('openai');
const pool    = require('../db');

let openai = null;
function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

const SYSTEM_PROMPT = `You are the virtual assistant for AI-Solutions, an enterprise AI consultancy based in Sunderland, UK.
Your job is to help website visitors understand our services, products, and pricing, and guide them toward booking a consultation.

About AI-Solutions:
- Founded in Sunderland, UK (12 Innovation Quarter, SR1 3EN)
- Phone: +44 (0)191 555 0100 | Email: helloo.ai.solutions@gmail.com
- 700+ clients served | 4.8★ average rating | GDPR compliant

Our Products:
1. HealthSync AI — AI-powered healthcare workflow & patient management
2. RetailMind — Retail analytics & customer behaviour intelligence
3. EduNova — Adaptive learning & education management
4. FleetPilot AI — Transportation & logistics optimisation
5. SecureVision — AI-driven surveillance & security monitoring

Our Services:
- Quality Data: Transform raw/unstructured data into AI-ready datasets
- Fine-tuned Models: Model optimisation with rigorous validation
- Inference Evaluation: AI risk reduction with oversight & error handling
- AI at Scale: Enterprise deployment, monitoring & continuous improvement

Behaviour rules:
- Be concise and helpful (max 3 short paragraphs per reply)
- Always offer to connect the user with our team for detailed enquiries
- Never invent pricing — direct price questions to the team
- Respond in British English`;

/**
 * POST /api/assistant/chat
 * Body: { message: string, sessionId: string }
 * Returns: { reply: string }
 */
router.post('/chat', async (req, res) => {
  const { message, session_id } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'message is required.' });
  }
  if (!session_id) {
    return res.status(400).json({ error: 'session_id is required.' });
  }

  const userMsg = message.trim().slice(0, 1000); // cap input

  try {
    // Persist user message
    await pool.query(
      `INSERT INTO assistant_messages (session_id, role, content) VALUES ($1, 'user', $2)`,
      [session_id, userMsg]
    );

    // Fetch last 8 turns for context (keeps cost low)
    const historyRes = await pool.query(
      `SELECT role, content FROM assistant_messages
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT 16`,
      [session_id]
    );
    const history = historyRes.rows.reverse().map(r => ({
      role: r.role,
      content: r.content,
    }));

    // Call OpenAI
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history,
      ],
      max_tokens: 400,
      temperature: 0.6,
    });

    const reply = completion.choices[0].message.content.trim();

    // Persist assistant reply
    await pool.query(
      `INSERT INTO assistant_messages (session_id, role, content) VALUES ($1, 'assistant', $2)`,
      [session_id, reply]
    );

    return res.json({ reply });
  } catch (err) {
    console.error('[Assistant] Error:', err.message);
    return res.status(500).json({
      error: 'Sorry, I\'m having trouble right now. Please email helloo.ai.solutions@gmail.com.',
    });
  }
});

module.exports = router;
