import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhoneNumber, unformatPhoneNumber } from "@/utils/phoneFormatter";

interface EditNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { numero: string; celular: string; status: string; operacao: string }) => void;
  initialData: {
    numero: string;
    celular: string;
    status: string;
    operacao: string;
  };
  availableValues: {
    celulares: string[];
    status: string[];
    operacoes: string[];
  };
}

export const EditNumberModal = ({ isOpen, onClose, onSave, initialData, availableValues }: EditNumberModalProps) => {
  const [formData, setFormData] = useState(initialData);

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  const handleNumeroChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    setFormData({ ...formData, numero: formatted });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Número</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-numero">Número</Label>
            <Input
              id="edit-numero"
              value={formData.numero}
              onChange={(e) => handleNumeroChange(e.target.value)}
              placeholder="(31) 99828-4929"
            />
          </div>
          <div>
            <Label htmlFor="edit-celular">Celular</Label>
            <Input
              id="edit-celular"
              list="celular-list"
              value={formData.celular}
              onChange={(e) => setFormData({ ...formData, celular: e.target.value })}
              placeholder="Celular"
            />
            <datalist id="celular-list">
              {availableValues.celulares.map((cel, idx) => (
                <option key={idx} value={cel} />
              ))}
            </datalist>
          </div>
          <div>
            <Label htmlFor="edit-status">Status</Label>
            <Input
              id="edit-status"
              list="status-list"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              placeholder="Status"
            />
            <datalist id="status-list">
              {availableValues.status.map((st, idx) => (
                <option key={idx} value={st} />
              ))}
            </datalist>
          </div>
          <div>
            <Label htmlFor="edit-operacao">Operação</Label>
            <Input
              id="edit-operacao"
              list="operacao-list"
              value={formData.operacao}
              onChange={(e) => setFormData({ ...formData, operacao: e.target.value })}
              placeholder="Operação"
            />
            <datalist id="operacao-list">
              {availableValues.operacoes.map((op, idx) => (
                <option key={idx} value={op} />
              ))}
            </datalist>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
