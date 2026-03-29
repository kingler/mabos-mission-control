export { MCTypeDBClient, TypeDBUnavailableError, getTypeDBClient } from './client';
export { MCGoalQueries, MCFactQueries, parseAnswers, extractVar, extractNum } from './queries';
export { writeKnowledgeToTypeDB, syncKnowledgeFromTypeDB, factToKnowledgeEntry } from './knowledge-sync';
