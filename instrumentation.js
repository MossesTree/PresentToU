import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';

new NodeSDK({ spanProcessors: [new LangfuseSpanProcessor()] }).start();
