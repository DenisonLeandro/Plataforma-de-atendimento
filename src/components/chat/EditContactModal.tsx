import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWhatsAppActions } from '@/hooks/whatsapp/useWhatsAppActions';
import { normalizeBrazilianPhone, isValidBrazilianPhone, formatBrazilianPhone } from '@/utils/phoneUtils';

interface EditContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactNotes?: string | null;
  onSuccess?: () => void;
}

interface ContactFormData {
  name: string;
  phone: string;
  notes: string;
}

export function EditContactModal({
  open,
  onOpenChange,
  contactId,
  contactName,
  contactPhone,
  contactNotes,
  onSuccess,
}: EditContactModalProps) {
  const { updateContact, isUpdatingContact, deleteContact, isDeletingContact } = useWhatsAppActions();
  const { isAdmin, isSupervisor, isReadOnlyView } = useAuth();
  const canDelete = (isAdmin || isSupervisor) && !isReadOnlyView;
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const handleDelete = () => {
    deleteContact(contactId, {
      onSuccess: () => {
        setIsConfirmDeleteOpen(false);
        onOpenChange(false);
        onSuccess?.();
      },
    });
  };

  const { register, handleSubmit, watch, setValue, formState: { errors }, reset } = useForm<ContactFormData>({
    defaultValues: {
      name: contactName,
      phone: formatBrazilianPhone(contactPhone),
      notes: contactNotes || ''
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: contactName,
        phone: formatBrazilianPhone(contactPhone),
        notes: contactNotes || ''
      });
    }
  }, [open, contactName, contactPhone, contactNotes, reset]);

  const phoneValue = watch('phone');

  const onSubmit = (data: ContactFormData) => {
    const normalizedPhone = normalizeBrazilianPhone(data.phone);
    const phoneChanged = normalizedPhone !== contactPhone;
    const nameChanged = data.name !== contactName;
    updateContact(
      {
        contactId,
        data: {
          name: data.name,
          notes: data.notes || null,
          // Only send phone_number when it actually changed (manual correction).
          ...(phoneChanged ? { phone_number: normalizedPhone } : {}),
          // Lock against webhook overwrite when the user manually edited phone or name.
          ...(phoneChanged || nameChanged ? { markManualEdit: true } : {}),
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Editar Contato</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                {...register('phone', { required: 'Telefone é obrigatório' })}
                onChange={(e) => setValue('phone', formatBrazilianPhone(e.target.value), { shouldValidate: true })}
                placeholder="Ex: (11) 99999-9999"
              />
              {errors.phone ? (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              ) : (
                phoneValue && !isValidBrazilianPhone(phoneValue) && (
                  <p className="text-sm text-amber-600">
                    Número fora do padrão brasileiro (DDD + número). Você ainda pode salvar.
                  </p>
                )
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                {...register('name', { 
                  required: 'Nome é obrigatório',
                  minLength: { value: 2, message: 'Nome deve ter pelo menos 2 caracteres' }
                })}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                {...register('notes')}
                placeholder="Adicione observações sobre este contato..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between gap-2">
            {canDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
                onClick={() => setIsConfirmDeleteOpen(true)}
                disabled={isDeletingContact}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir contato
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isUpdatingContact}>
                {isUpdatingContact ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>

      <AlertDialog open={isConfirmDeleteOpen} onOpenChange={setIsConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato {contactName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e não pode ser desfeita. Excluir este contato
              também <strong>apaga todas as conversas e mensagens</strong> associadas a
              ele. O registro da exclusão ficará visível na aba Atividades.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingContact}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeletingContact}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingContact ? 'Excluindo...' : 'Excluir definitivamente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
