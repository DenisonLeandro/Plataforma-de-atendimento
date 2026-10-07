import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { sortAssignmentAgents } from '../src/utils/assignmentOrder.ts';

test('ordena os demais atendentes alfabeticamente, sem priorizar papel ou presença', () => {
  const agents = [
    { full_name: 'Renata Henrique Leandro', role: 'admin' },
    { full_name: 'Marcio Barbosa', role: 'supervisor' },
    { full_name: 'João Tadeu', role: 'agent' },
    { full_name: 'Ágata', role: 'agent' },
    { full_name: 'Leonardo Aguiar', role: 'supervisor' },
  ];
  assert.deepEqual(sortAssignmentAgents(agents).map(agent => agent.full_name), [
    'Ágata', 'João Tadeu', 'Leonardo Aguiar', 'Marcio Barbosa', 'Renata Henrique Leandro',
  ]);
  assert.equal(agents[0].full_name, 'Renata Henrique Leandro');
});

test('mantém somente o administrador Denison em primeiro', () => {
  const agents = [
    { full_name: 'Ana', role: 'agent' },
    { full_name: 'DENISON HENRIQUE LEANDRO', role: 'admin' },
    { full_name: 'Denison Outro', role: 'admin' },
  ];
  assert.deepEqual(sortAssignmentAgents(agents).map(agent => agent.full_name), [
    'DENISON HENRIQUE LEANDRO', 'Ana', 'Denison Outro',
  ]);
  assert.deepEqual(sortAssignmentAgents([
    { full_name: 'DENISON HENRIQUE LEANDRO', role: 'agent' }, agents[0],
  ]).map(agent => agent.full_name), ['Ana', 'DENISON HENRIQUE LEANDRO']);
});