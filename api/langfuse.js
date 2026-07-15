import '../instrumentation.js';
import { LangfuseClient } from '@langfuse/client';
import { getActiveTraceId, observe } from '@langfuse/tracing';

const langfuse = new LangfuseClient();

export const observeAiRequest = (handler, name) => observe(handler, { name });

export async function recordSlo({ ok, durationMs, feature }) {
  const traceId = getActiveTraceId();
  if (!traceId) return;
  try {
    langfuse.score.create({
      id: `${traceId}-ai-slo`,
      traceId,
      name: 'ai_slo',
      value: ok ? 1 : 0,
      dataType: 'BOOLEAN',
      comment: `${feature}: ${ok ? 'success' : 'failure'} in ${durationMs}ms`,
    });
    await langfuse.flush();
  } catch (error) {
    console.error('Langfuse SLO 기록 실패', error);
  }
}
