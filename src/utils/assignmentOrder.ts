interface NamedAssignee {
  full_name: string;
  role: string;
}

const nameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

function isPinnedAdmin(agent: NamedAssignee): boolean {
  return agent.role === 'admin' &&
    agent.full_name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR') === 'denison henrique leandro';
}

export function sortAssignmentAgents<T extends NamedAssignee>(agents: readonly T[]): T[] {
  return [...agents].sort((a, b) => {
    const priority = Number(isPinnedAdmin(b)) - Number(isPinnedAdmin(a));
    return priority || nameCollator.compare(a.full_name.trim(), b.full_name.trim());
  });
}