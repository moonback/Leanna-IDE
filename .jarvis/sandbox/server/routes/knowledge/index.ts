export { default as knowledgeRouter } from "./knowledgeRouter";
export { default as memoryRouter } from "./memoryRouter";
export { default as impactRouter } from "./impactRouter";
export { default as understandingRouter } from "./understandingRouter";

import type { Router } from "express";
import knowledgeRouter_ from "./knowledgeRouter";
import memoryRouter_ from "./memoryRouter";
import impactRouter_ from "./impactRouter";
import understandingRouter_ from "./understandingRouter";

export function createKnowledgeRoutes(): Router[] {
  return [knowledgeRouter_, memoryRouter_, impactRouter_, understandingRouter_];
}
