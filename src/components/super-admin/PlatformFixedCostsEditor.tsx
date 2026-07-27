import { useState } from 'react';
import { usePlatformFixedCosts, type PlatformFixedCost } from '@/hooks/usePlatformFixedCosts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Loader2, Check, X, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const brl = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

interface EditorRowProps {
  cost: PlatformFixedCost;
  onUpdate: (id: string, patch: Partial<Pick<PlatformFixedCost, 'label' | 'amount_brl' | 'active'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function EditorRow({ cost, onUpdate, onDelete }: EditorRowProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(cost.label);
  const [amount, setAmount] = useState(String(cost.amount_brl));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const parsed = Number(amount.replace(',', '.'));
    if (!label.trim() || Number.isNaN(parsed) || parsed < 0) {
      toast.error('Informe um nome e um valor válido (>= 0).');
      return;
    }
    setBusy(true);
    try {
      await onUpdate(cost.id, { label: label.trim(), amount_brl: parsed });
      setEditing(false);
      toast.success('Custo atualizado');
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (next: boolean) => {
    setBusy(true);
    try {
      await onUpdate(cost.id, { active: next });
    } catch {
      toast.error('Erro ao alterar');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await onDelete(cost.id);
      toast.success('Custo removido');
    } catch {
      toast.error('Erro ao remover');
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 py-2 border-b last:border-b-0">
      {editing ? (
        <>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1 h-9"
            disabled={busy}
            placeholder="Nome do custo"
          />
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32 h-9 text-right"
            disabled={busy}
            inputMode="decimal"
            placeholder="0,00"
          />
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={() => {
              setEditing(false);
              setLabel(cost.label);
              setAmount(String(cost.amount_brl));
            }}
            disabled={busy}
          >
            <X className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <span className={`flex-1 text-sm ${cost.active ? '' : 'text-muted-foreground line-through'}`}>
            {cost.label}
          </span>
          <span className={`w-32 text-right text-sm tabular-nums ${cost.active ? 'font-medium' : 'text-muted-foreground'}`}>
            {brl(cost.amount_brl)}
          </span>
          <Switch
            checked={cost.active}
            onCheckedChange={toggleActive}
            disabled={busy}
            title={cost.active ? 'Ativo (entra no rateio)' : 'Inativo'}
          />
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditing(true)} disabled={busy}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={remove} disabled={busy}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}

export function PlatformFixedCostsEditor() {
  const { costs, isLoading, addCost, updateCost, deleteCost } = usePlatformFixedCosts();
  const [newLabel, setNewLabel] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const parsed = Number(newAmount.replace(',', '.'));
    if (!newLabel.trim() || Number.isNaN(parsed) || parsed < 0) {
      toast.error('Informe um nome e um valor válido (>= 0).');
      return;
    }
    setAdding(true);
    try {
      await addCost(newLabel.trim(), parsed);
      setNewLabel('');
      setNewAmount('');
      toast.success('Custo adicionado');
    } catch {
      toast.error('Erro ao adicionar');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Custos fixos mensais</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <div>
            {costs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Nenhum custo fixo cadastrado.</p>
            ) : (
              costs.map((cost) => (
                <EditorRow key={cost.id} cost={cost} onUpdate={updateCost} onDelete={deleteCost} />
              ))
            )}
          </div>
        )}

        {/* Adicionar novo */}
        <div className="flex items-center gap-2 pt-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="flex-1 h-9"
            placeholder="Novo custo (ex.: Hospedagem)"
            disabled={adding}
          />
          <Input
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            className="w-32 h-9 text-right"
            placeholder="0,00"
            inputMode="decimal"
            disabled={adding}
          />
          <Button size="sm" onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="ml-1">Adicionar</span>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Desligue o interruptor para tirar um custo do rateio sem apagá-lo. Só custos ativos entram na conta.
        </p>
      </CardContent>
    </Card>
  );
}
