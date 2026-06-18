import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  const { updateContact, isUpdatingContact } = useWhatsAppActions();
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

          <DialogFooter>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
