import { useMemo } from 'react';
import { Node, Edge } from '@xyflow/react';

interface ConditionRule {
  id: string;
  type: 'variable' | 'tag';
  variable?: string;
  operator?: string;
  value?: string;
  tagName?: string;
  tagCondition?: 'has' | 'not_has';
}

interface ValidationResult {
  nodeId: string;
  undefinedVariables: string[];
}

// System variables that are always available
const SYSTEM_VARIABLES = [
  'contact_name',
  'contact_phone',
  'last_message',
  'current_time',
  'current_date',
  'instance_name',
];

/**
 * Finds all nodes that can reach a target node by traversing edges backwards
 */
function findPredecessorNodes(targetNodeId: string, nodes: Node[], edges: Edge[]): Set<string> {
  const predecessors = new Set<string>();
  const visited = new Set<string>();
  const queue = [targetNodeId];
  
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    
    // Find all edges pointing to the current node
    const incomingEdges = edges.filter(edge => edge.target === currentId);
    
    for (const edge of incomingEdges) {
      predecessors.add(edge.source);
      if (!visited.has(edge.source)) {
        queue.push(edge.source);
      }
    }
  }
  
  return predecessors;
}

/**
 * Gets all variables defined by a node
 */
function getDefinedVariables(node: Node): string[] {
  const variables: string[] = [];
  const data = node.data as Record<string, unknown>;
  
  if (node.type === 'setVariable') {
    const varName = data.variableName as string | undefined;
    if (varName) {
      variables.push(varName);
    }
  }
  
  if (node.type === 'waitInput') {
    const saveAs = data.saveAs as string | undefined;
    if (saveAs) {
      variables.push(saveAs);
    }
  }
  
  return variables;
}

/**
 * Gets all variables used in a condition node
 */
function getUsedVariables(node: Node): string[] {
  const variables: string[] = [];
  const data = node.data as Record<string, unknown>;
  
  if (node.type === 'condition') {
    const conditions = data.conditions as ConditionRule[] | undefined;
    
    if (conditions && Array.isArray(conditions)) {
      for (const condition of conditions) {
        if (condition.type === 'variable' && condition.variable) {
          variables.push(condition.variable);
        }
      }
    }
    
    // Legacy support
    const legacyVariable = data.variable as string | undefined;
    if (legacyVariable && !conditions?.length) {
      variables.push(legacyVariable);
    }
  }
  
  return variables;
}

/**
 * Validates condition nodes and returns which variables are undefined
 */
export function useFlowValidation(nodes: Node[], edges: Edge[]): Map<string, ValidationResult> {
  return useMemo(() => {
    const results = new Map<string, ValidationResult>();
    
    // Find all condition nodes
    const conditionNodes = nodes.filter(node => node.type === 'condition');
    
    for (const conditionNode of conditionNodes) {
      const usedVariables = getUsedVariables(conditionNode);
      if (usedVariables.length === 0) continue;
      
      // Find all predecessor nodes
      const predecessorIds = findPredecessorNodes(conditionNode.id, nodes, edges);
      
      // Collect all defined variables from predecessors
      const definedVariables = new Set<string>(SYSTEM_VARIABLES);
      
      for (const nodeId of predecessorIds) {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          const vars = getDefinedVariables(node);
          vars.forEach(v => definedVariables.add(v));
        }
      }
      
      // Check which used variables are undefined
      const undefinedVariables = usedVariables.filter(v => !definedVariables.has(v));
      
      if (undefinedVariables.length > 0) {
        results.set(conditionNode.id, {
          nodeId: conditionNode.id,
          undefinedVariables,
        });
      }
    }
    
    return results;
  }, [nodes, edges]);
}
