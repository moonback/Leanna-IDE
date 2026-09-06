/**
 * Adapters Module — Adapters pour intégrer les composants existants avec EventBus
 * 
 * Ce module fournit des adapters pour :
 * - AgentMessageBusAdapter : Intègre AgentMessageBus avec EventBus
 * - AgentEventStreamAdapter : Intègre AgentEventStream avec EventBus
 * - ExecutorAdapter : Intègre mission/Executor avec EventBus
 */

export * from "./AgentMessageBusAdapter.js";
export * from "./AgentEventStreamAdapter.js";
export * from "./ExecutorAdapter.js";
