const SYSTEM_PROMPT = 'Você é o assistente virtual da DEJ PLAYER. Responda em português brasileiro, com clareza, simpatia e respostas curtas. A página informa: plano mensal R$25,00; semestral R$100,00; anual R$150,00. Os planos listam 1 tela, qualidade FHD/HD/SD, canais/filmes/séries, mais de 70 mil conteúdos e atualização mensal. A página anuncia teste grátis antes de pagar, conteúdos em HD, Full HD e 4K, e suporte. Se perguntarem condições específicas do teste, compatibilidade de aparelho, catálogo, disponibilidade, pagamento ou ativação, não invente detalhes: explique que a equipe precisa confirmar. Não afirme que há integração com WhatsApp; este é um atendimento automático do site. Ajude a pessoa a comparar os planos e a encontrar a seção correspondente.';
const TRANSIENT_STATUSES = new Set([404, 429, 503]);
const REQUEST_TIMEOUT_MS = 10_000;

function jsonError(res, status, error) {
  return res.status(status).json({ error });
}

function parseBody(body) {
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body && typeof body === 'object' ? body : null;
}

async function generate(model, key, payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Keep malformed provider responses inside our normal error handling.
  }
  return { response, data };
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    if (req.method !== 'POST') return jsonError(res, 405, 'Método não permitido.');

    const key = process.env.GEMINI_API_KEY;
    if (!key) return jsonError(res, 503, 'Configure GEMINI_API_KEY no servidor.');

    const body = parseBody(req.body);
    const messages = Array.isArray(body?.messages) ? body.messages.slice(-12) : [];
    const contents = messages
      .filter(message => message && typeof message === 'object'
        && ['user', 'model'].includes(message.role)
        && typeof message.text === 'string')
      .map(message => ({ role: message.role, parts: [{ text: message.text.slice(0, 2000) }] }));

    if (!contents.length || contents.at(-1).role !== 'user') {
      return jsonError(res, 400, 'Envie uma mensagem válida.');
    }

    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';
    const payload = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { maxOutputTokens: 350, temperature: 0.45 },
    };

    let result;
    try {
      result = await generate(model, key, payload);
    } catch (error) {
      if (!fallbackModel || fallbackModel === model) throw error;
      console.warn(`Falha ao consultar o modelo Gemini principal (${error?.name || 'erro'}); tentando o modelo reserva.`);
      result = await generate(fallbackModel, key, payload);
    }

    if (TRANSIENT_STATUSES.has(result.response.status) && fallbackModel && fallbackModel !== model) {
      console.warn(`Modelo Gemini principal indisponível (HTTP ${result.response.status}); tentando o modelo reserva.`);
      result = await generate(fallbackModel, key, payload);
    }

    if (!result.response.ok) {
      const status = result.response.status;
      const providerMessage = typeof result.data?.error?.message === 'string'
        ? result.data.error.message.slice(0, 300)
        : 'sem detalhe';
      console.error(`Gemini respondeu HTTP ${status}: ${providerMessage}`);
      if (status === 401 || status === 403) return jsonError(res, 502, 'A chave do Gemini foi recusada. Confira GEMINI_API_KEY na Vercel.');
      if (status === 404) return jsonError(res, 502, 'O modelo Gemini configurado não está disponível. Confira GEMINI_MODEL e GEMINI_FALLBACK_MODEL.');
      if (status === 429) return jsonError(res, 502, 'O limite de uso do Gemini foi atingido. Tente novamente em instantes.');
      return jsonError(res, 502, 'O Gemini está temporariamente indisponível. Tente novamente em instantes.');
    }

    const text = result.data?.candidates?.[0]?.content?.parts
      ?.map(part => typeof part.text === 'string' ? part.text : '')
      .join('')
      .trim();
    return res.status(200).json({ text: text || 'Não consegui formular uma resposta. Tente novamente.' });
  } catch (error) {
    console.error(`Falha na função /api/chat (${error?.name || 'erro'}): ${error?.message || 'sem detalhe'}`);
    return jsonError(res, 502, 'O atendimento automático está temporariamente indisponível. Tente novamente em instantes.');
  }
}
