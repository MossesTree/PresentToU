// PresentToU — 음성 파일 STT (Vercel 서버리스, Groq)
// 클라이언트가 multipart/form-data로 오디오(file) + model 을 보내면,
// GROQ_API_KEY로 Groq 음성 인식(whisper-large-v3)에 그대로 전달해 전사 텍스트를 반환한다.
// (키는 서버 측에만 존재 — 브라우저 비노출)
// Groq는 OpenAI 호환 API라 요청 형식이 동일하다.

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다.' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: '환경변수 GROQ_API_KEY가 설정되지 않았습니다.' });
    return;
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    res.status(400).json({ error: 'multipart/form-data 형식의 오디오가 필요합니다.' });
    return;
  }

  try {
    // 브라우저가 만든 multipart(file + model) 바이트를 그대로 Groq로 전달
    const body = await readRawBody(req);
    const aiRes = await fetch(GROQ_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': contentType },
      body,
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      res.status(502).json({ error: `STT 오류 (${aiRes.status}): ${errText.slice(0, 300)}` });
      return;
    }

    const data = await aiRes.json();
    res.status(200).json({ text: data.text || '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || '서버 오류' });
  }
}
