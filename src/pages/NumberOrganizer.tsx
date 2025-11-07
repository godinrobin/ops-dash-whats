import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Trash2, Plus, Edit2, ArrowUpDown, Search, GripVertical, Eye, EyeOff } from "lucide-react";
import { formatPhoneNumber } from "@/utils/phoneFormatter";
import { EditNumberModal } from "@/components/EditNumberModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface OrganizedNumber {
  id: string;
  numero: string;
  celular: string;
  status: string;
  operacao: string;
  created_at: string;
  order_position: number | null;
}

type SortField = 'numero' | 'celular' | 'status' | 'operacao';
type SortDirection = 'asc' | 'desc' | null;

function SortableRow({ number, isSelected, onSelect, onEdit, onDelete, numbersBlurred }: {
  number: OrganizedNumber;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit: (number: OrganizedNumber) => void;
  onDelete: (id: string) => void;
  numbersBlurred: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: number.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-12">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onSelect(number.id)}
          />
          <button
            className="cursor-grab active:cursor-grabbing touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </TableCell>
      <TableCell className="font-medium">
        <span className={numbersBlurred ? "blur-sm select-none" : ""}>
          {number.numero}
        </span>
      </TableCell>
      <TableCell>{number.celular}</TableCell>
      <TableCell>{number.status}</TableCell>
      <TableCell>{number.operacao}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(number)}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(number.id)}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

const NumberOrganizer = () => {
  const { user } = useAuth();
  const [numbers, setNumbers] = useState<OrganizedNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNumber, setNewNumber] = useState({
    numero: "",
    celular: "",
    status: "",
    operacao: ""
  });
  const [editingNumber, setEditingNumber] = useState<OrganizedNumber | null>(null);
  const [filters, setFilters] = useState({
    celular: "",
    status: "",
    operacao: ""
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    celular: "",
    status: "",
    operacao: ""
  });
  const [numbersBlurred, setNumbersBlurred] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadNumbers = async () => {
    if (!user) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from("organized_numbers")
      .select("*")
      .eq("user_id", user.id)
      .order("order_position", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar números");
      console.error(error);
    } else {
      setNumbers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadNumbers();
  }, [user]);

  const availableValues = useMemo(() => {
    const celulares = [...new Set(numbers.map(n => n.celular).filter(Boolean))];
    const status = [...new Set(numbers.map(n => n.status).filter(Boolean))];
    const operacoes = [...new Set(numbers.map(n => n.operacao).filter(Boolean))];
    return { celulares, status, operacoes };
  }, [numbers]);

  const filteredAndSortedNumbers = useMemo(() => {
    let filtered = numbers.filter(number => {
      if (filters.celular && filters.celular.trim() && number.celular !== filters.celular) return false;
      if (filters.status && filters.status.trim() && number.status !== filters.status) return false;
      if (filters.operacao && filters.operacao.trim() && number.operacao !== filters.operacao) return false;
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          number.numero.toLowerCase().includes(query) ||
          number.celular.toLowerCase().includes(query) ||
          number.status.toLowerCase().includes(query) ||
          number.operacao.toLowerCase().includes(query)
        );
      }
      
      return true;
    });

    if (sortField && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortField] || "";
        const bVal = b[sortField] || "";
        if (sortDirection === 'asc') {
          return aVal.localeCompare(bVal);
        } else {
          return bVal.localeCompare(aVal);
        }
      });
    }

    return filtered;
  }, [numbers, filters, sortField, sortDirection, searchQuery]);

  const handleAddNumber = async () => {
    if (!user) return;
    
    if (!newNumber.numero) {
      toast.error("Preencha ao menos o campo número");
      return;
    }

    const maxPosition = numbers.reduce((max, n) => 
      Math.max(max, n.order_position || 0), 0
    );

    const { error } = await supabase
      .from("organized_numbers")
      .insert([{
        user_id: user.id,
        numero: newNumber.numero,
        celular: newNumber.celular,
        status: newNumber.status,
        operacao: newNumber.operacao,
        order_position: maxPosition + 1
      }]);

    if (error) {
      toast.error("Erro ao adicionar número");
      console.error(error);
    } else {
      toast.success("Número adicionado com sucesso!");
      setNewNumber({ numero: "", celular: "", status: "", operacao: "" });
      loadNumbers();
    }
  };

  const handleUpdateNumber = async (id: string, data: { numero: string; celular: string; status: string; operacao: string }) => {
    const { error } = await supabase
      .from("organized_numbers")
      .update({
        numero: data.numero,
        celular: data.celular,
        status: data.status,
        operacao: data.operacao
      })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar número");
      console.error(error);
    } else {
      toast.success("Número atualizado com sucesso!");
      loadNumbers();
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleNumeroChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    setNewNumber({ ...newNumber, numero: formatted });
  };

  const handleDeleteNumber = async (id: string) => {
    const { error } = await supabase
      .from("organized_numbers")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao deletar número");
      console.error(error);
    } else {
      toast.success("Número deletado com sucesso!");
      loadNumbers();
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = numbers.findIndex((n) => n.id === active.id);
      const newIndex = numbers.findIndex((n) => n.id === over.id);

      const newOrder = arrayMove(numbers, oldIndex, newIndex);
      setNumbers(newOrder);

      // Update order_position for all affected items
      const updates = newOrder.map((num, index) => ({
        id: num.id,
        order_position: index + 1
      }));

      for (const update of updates) {
        await supabase
          .from("organized_numbers")
          .update({ order_position: update.order_position })
          .eq("id", update.id);
      }

      toast.success("Ordem atualizada!");
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedNumbers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedNumbers.map(n => n.id)));
    }
  };

  const handleSelectNumber = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const { error } = await supabase
      .from("organized_numbers")
      .delete()
      .in("id", Array.from(selectedIds));

    if (error) {
      toast.error("Erro ao deletar números");
      console.error(error);
    } else {
      toast.success(`${selectedIds.size} números deletados com sucesso!`);
      setSelectedIds(new Set());
      loadNumbers();
    }
  };

  const handleBulkEdit = async () => {
    if (selectedIds.size === 0) return;

    const updates: any = {};
    if (bulkEditData.celular) updates.celular = bulkEditData.celular;
    if (bulkEditData.status) updates.status = bulkEditData.status;
    if (bulkEditData.operacao) updates.operacao = bulkEditData.operacao;

    if (Object.keys(updates).length === 0) {
      toast.error("Preencha ao menos um campo para editar");
      return;
    }

    const { error } = await supabase
      .from("organized_numbers")
      .update(updates)
      .in("id", Array.from(selectedIds));

    if (error) {
      toast.error("Erro ao atualizar números");
      console.error(error);
    } else {
      toast.success(`${selectedIds.size} números atualizados com sucesso!`);
      setSelectedIds(new Set());
      setBulkEditMode(false);
      setBulkEditData({ celular: "", status: "", operacao: "" });
      loadNumbers();
    }
  };

  return (
    <>
      <Header />
      <div className="h-14 md:h-16" />
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="container mx-auto max-w-6xl">
          <header className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">📱 Organizador de Números</h1>
            <p className="text-muted-foreground text-lg">
              Gerencie seus números de trabalho com facilidade
            </p>
          </header>

          <div className="bg-card rounded-lg p-6 mb-6 border">
            <h2 className="text-xl font-semibold mb-4">Adicionar Novo Número</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <Input
                placeholder="Número"
                value={newNumber.numero}
                onChange={(e) => handleNumeroChange(e.target.value)}
              />
              <Input
                placeholder="Celular"
                list="add-celular-list"
                value={newNumber.celular}
                onChange={(e) => setNewNumber({ ...newNumber, celular: e.target.value })}
              />
              <datalist id="add-celular-list">
                {availableValues.celulares.map((cel, idx) => (
                  <option key={idx} value={cel} />
                ))}
              </datalist>
              <Input
                placeholder="Status"
                list="add-status-list"
                value={newNumber.status}
                onChange={(e) => setNewNumber({ ...newNumber, status: e.target.value })}
              />
              <datalist id="add-status-list">
                {availableValues.status.map((st, idx) => (
                  <option key={idx} value={st} />
                ))}
              </datalist>
              <Input
                placeholder="Operação"
                list="add-operacao-list"
                value={newNumber.operacao}
                onChange={(e) => setNewNumber({ ...newNumber, operacao: e.target.value })}
              />
              <datalist id="add-operacao-list">
                {availableValues.operacoes.map((op, idx) => (
                  <option key={idx} value={op} />
                ))}
              </datalist>
            </div>
            <Button 
              onClick={handleAddNumber}
              className="w-full md:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Número
            </Button>
          </div>

          <div className="bg-card rounded-lg p-6 mb-6 border">
            <h2 className="text-xl font-semibold mb-4">Pesquisa e Filtros</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div>
                <Select value={filters.celular} onValueChange={(value) => setFilters({ ...filters, celular: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por celular" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">Todos</SelectItem>
                    {availableValues.celulares.map((cel, idx) => (
                      <SelectItem key={idx} value={cel}>{cel}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={filters.status} onValueChange={(value) => setFilters({ ...filters, status: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">Todos</SelectItem>
                    {availableValues.status.map((st, idx) => (
                      <SelectItem key={idx} value={st}>{st}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={filters.operacao} onValueChange={(value) => setFilters({ ...filters, operacao: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por operação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">Todas</SelectItem>
                    {availableValues.operacoes.map((op, idx) => (
                      <SelectItem key={idx} value={op}>{op}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="bg-card rounded-lg p-6 mb-6 border">
              <h2 className="text-xl font-semibold mb-4">
                Ações em Massa ({selectedIds.size} selecionados)
              </h2>
              <div className="flex flex-wrap gap-4">
                <Button
                  variant="destructive"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Deletar Selecionados
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setBulkEditMode(!bulkEditMode)}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Editar Selecionados
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Desmarcar Todos
                </Button>
              </div>

              {bulkEditMode && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-4">
                    Preencha apenas os campos que deseja atualizar
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <Input
                      placeholder="Celular"
                      list="bulk-celular-list"
                      value={bulkEditData.celular}
                      onChange={(e) => setBulkEditData({ ...bulkEditData, celular: e.target.value })}
                    />
                    <datalist id="bulk-celular-list">
                      {availableValues.celulares.map((cel, idx) => (
                        <option key={idx} value={cel} />
                      ))}
                    </datalist>
                    <Input
                      placeholder="Status"
                      list="bulk-status-list"
                      value={bulkEditData.status}
                      onChange={(e) => setBulkEditData({ ...bulkEditData, status: e.target.value })}
                    />
                    <datalist id="bulk-status-list">
                      {availableValues.status.map((st, idx) => (
                        <option key={idx} value={st} />
                      ))}
                    </datalist>
                    <Input
                      placeholder="Operação"
                      list="bulk-operacao-list"
                      value={bulkEditData.operacao}
                      onChange={(e) => setBulkEditData({ ...bulkEditData, operacao: e.target.value })}
                    />
                    <datalist id="bulk-operacao-list">
                      {availableValues.operacoes.map((op, idx) => (
                        <option key={idx} value={op} />
                      ))}
                    </datalist>
                  </div>
                  <Button onClick={handleBulkEdit}>
                    Aplicar Alterações
                  </Button>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground text-lg">Carregando...</p>
            </div>
          ) : numbers.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground text-lg">
                Você ainda não tem números cadastrados
              </p>
            </div>
          ) : (
            <div className="bg-card rounded-lg border overflow-hidden">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedIds.size === filteredAndSortedNumbers.length && filteredAndSortedNumbers.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSort('numero')}
                            className="flex items-center gap-1"
                          >
                            Número
                            <ArrowUpDown className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setNumbersBlurred(!numbersBlurred)}
                          >
                            {numbersBlurred ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort('celular')}
                          className="flex items-center gap-1"
                        >
                          Celular
                          <ArrowUpDown className="w-3 h-3" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort('status')}
                          className="flex items-center gap-1"
                        >
                          Status
                          <ArrowUpDown className="w-3 h-3" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSort('operacao')}
                          className="flex items-center gap-1"
                        >
                          Operação
                          <ArrowUpDown className="w-3 h-3" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <SortableContext
                      items={filteredAndSortedNumbers.map(n => n.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {filteredAndSortedNumbers.map((number) => (
                        <SortableRow
                          key={number.id}
                          number={number}
                          isSelected={selectedIds.has(number.id)}
                          onSelect={handleSelectNumber}
                          onEdit={setEditingNumber}
                          onDelete={handleDeleteNumber}
                          numbersBlurred={numbersBlurred}
                        />
                      ))}
                    </SortableContext>
                  </TableBody>
                </Table>
              </DndContext>
            </div>
          )}

          {editingNumber && (
            <EditNumberModal
              isOpen={true}
              onClose={() => setEditingNumber(null)}
              onSave={(data) => handleUpdateNumber(editingNumber.id, data)}
              initialData={{
                numero: editingNumber.numero,
                celular: editingNumber.celular,
                status: editingNumber.status,
                operacao: editingNumber.operacao
              }}
              availableValues={availableValues}
            />
          )}

          <footer className="mt-16 text-center text-xs text-muted-foreground/50">
            Criado por <a href="https://instagram.com/joaolucaspss" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">@joaolucaspss</a>
          </footer>
        </div>
      </div>
    </>
  );
};

export default NumberOrganizer;