// presen2U — 음성 파일 STT (Vercel 서버리스, Groq)
// 클라이언트가 multipart/form-data로 오디오(file) + model 을 보내면,
// GROQ_API_KEY로 Groq 음성 인식(whisper-large-v3)에 그대로 전달해 전사 텍스트를 반환한다.
// (키는 서버 측에만 존재 — 브라우저 비노출)
// Groq는 OpenAI 호환 API라 요청 형식이 동일하다.

import { observeAiRequest, recordSlo } from './langfuse.js';

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
// 음성 전사 요청의 단계별 처리 시간을 요청 ID와 함께 기록한다
function createRequestId(req) {
  return req.headers['x-request-id'] || `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

function logEvent(requestId, event, details = {}, level = 'info') {
  const payload = JSON.stringify({ scope: 'transcribe', timestamp: new Date().toISOString(), requestId, event, ...details });
  if (level === 'error') console.error(payload);
  else console.log(payload);
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function handler(req, res) {
  const requestId = createRequestId(req);
  const startedAt = Date.now();
  const log = (event, details = {}, level = 'info') => logEvent(requestId, event, details, level);
  res.setHeader('x-request-id', requestId);
  log('request.start', { method: req.method });
  if (req.method !== 'POST') {
    log('request.rejected', { reason: 'method_not_allowed' }, 'error');
    res.status(405).json({ error: 'POST만 지원합니다.' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    log('request.rejected', { reason: 'missing_api_key' }, 'error');
    res.status(500).json({ error: '환경변수 GROQ_API_KEY가 설정되지 않았습니다.' });
    return;
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    log('request.rejected', { reason: 'invalid_content_type' }, 'error');
    res.status(400).json({ error: 'multipart/form-data 형식의 오디오가 필요합니다.' });
    return;
  }

  try {
    // 브라우저가 만든 multipart(file + model) 바이트를 그대로 Groq로 전달
    const body = await readRawBody(req);
    log('body.read.complete', { byteLength: body.length });
    log('groq.request.start', { contentType });
    const aiRes = await fetch(GROQ_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': contentType },
      body,
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      log('groq.request.error', { status: aiRes.status, message: errText.slice(0, 200), durationMs: Date.now() - startedAt }, 'error');
      res.status(502).json({ error: `STT 오류 (${aiRes.status}): ${errText.slice(0, 300)}` });
      return;
    }

    const data = await aiRes.json();
    log('groq.request.complete', { status: aiRes.status, durationMs: Date.now() - startedAt, textLength: (data.text || '').length });
    await recordSlo({ ok: true, durationMs: Date.now() - startedAt, feature: 'transcribe' });
    res.status(200).json({ text: data.text || '' });
  } catch (err) {
    await recordSlo({ ok: false, durationMs: Date.now() - startedAt, feature: 'transcribe' });
    log('request.error', { name: err.name, message: err.message, durationMs: Date.now() - startedAt }, 'error');
    console.error(err);
    res.status(500).json({ error: err.message || '서버 오류' });
  }
}

export default observeAiRequest(handler, 'presen2u.transcribe');
