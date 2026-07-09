import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Edit, Save, X, MessageSquare, Pencil } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useContactAvatar } from '@/hooks/useContactAvatar';

interface ContactHeaderProps {
  contact: Tables<'whatsapp_contacts'>;
}

export function ContactHeader({ contact }: ContactHeaderProps) {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notes, setNotes] = useState(contact.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(contact.name || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const avatarUrl = useContactAvatar(contact.profile_picture_url);

  const initials = contact.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSaveNotes = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('whatsapp_contacts')
        .update({ notes })
        .eq('id', contact.id);

      if (error) throw error;

      toast.success('Notas atualizadas com sucesso');
      setIsEditingNotes(false);
      queryClient.invalidateQueries({ queryKey: ['contact-details', contact.id] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-contacts'] });
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error('Erro ao salvar notas');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartConversation = () => {
    navigate(`/whatsapp?contact=${contact.id}`);
  };

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Nome não pode ficar vazio');
      return;
    }
    setIsSavingName(true);
    try {
      const { error } = await supabase
        .from('whatsapp_contacts')
        .update({ name: trimmed })
        .eq('id', contact.id);

      if (error) throw error;

      toast.success('Nome atualizado com sucesso');
      setIsEditingName(false);
      queryClient.invalidateQueries({ queryKey: ['contact-details', contact.id] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    } catch (error) {
      console.error('Error saving name:', error);
      toast.error('Erro ao salvar nome');
    } finally {
      setIsSavingName(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-6">
          <Avatar className="h-24 w-24">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
          </Avatar>

          <div className="flex-1">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0 mr-4">
                {isEditingName ? (
                  <div className="flex items-center gap-2 mb-1">
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') {
                          setIsEditingName(false);
                          setName(contact.name || '');
                        }
                      }}
                      autoFocus
                      className="text-2xl font-bold h-auto py-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsEditingName(false);
                        setName(contact.name || '');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSaveName}
                      disabled={isSavingName}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-1 group">
                    <h2 className="text-2xl font-bold truncate">{contact.name}</h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setName(contact.name || '');
                        setIsEditingName(true);
                      }}
                      title="Editar nome"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <p className="text-muted-foreground">{contact.phone_number}</p>
              </div>
              <Button onClick={handleStartConversation}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Nova Conversa
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Notas</label>
                {!isEditingNotes ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingNotes(true)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsEditingNotes(false);
                        setNotes(contact.notes || '');
                      }}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancelar
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSaveNotes}
                      disabled={isSaving}
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Salvar
                    </Button>
                  </div>
                )}
              </div>

              {isEditingNotes ? (
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Adicione observações sobre este contato..."
                  rows={3}
                  className="resize-none"
                />
              ) : (
                <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md min-h-[80px]">
                  {contact.notes || 'Nenhuma nota adicionada'}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
