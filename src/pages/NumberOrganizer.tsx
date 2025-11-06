import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

interface OrganizedNumber {
  id: string;
  numero: string;
  celular: string;
  status: string;
  operacao: string;
  created_at: string;
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

  const loadNumbers = async () => {
    if (!user) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from("organized_numbers")
      .select("*")
      .eq("user_id", user.id)
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

  const handleAddNumber = async () => {
    if (!user) return;
    
    if (!newNumber.numero || !newNumber.celular || !newNumber.status || !newNumber.operacao) {
      toast.error("Preencha todos os campos");
      return;
    }

    const { error } = await supabase
      .from("organized_numbers")
      .insert([{
        user_id: user.id,
        numero: newNumber.numero,
        celular: newNumber.celular,
        status: newNumber.status,
        operacao: newNumber.operacao
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <Input
                placeholder="Número"
                value={newNumber.numero}
                onChange={(e) => setNewNumber({ ...newNumber, numero: e.target.value })}
              />
              <Input
                placeholder="Celular"
                value={newNumber.celular}
                onChange={(e) => setNewNumber({ ...newNumber, celular: e.target.value })}
              />
              <Input
                placeholder="Status"
                value={newNumber.status}
                onChange={(e) => setNewNumber({ ...newNumber, status: e.target.value })}
              />
              <Input
                placeholder="Operação"
                value={newNumber.operacao}
                onChange={(e) => setNewNumber({ ...newNumber, operacao: e.target.value })}
              />
            </div>
            <Button 
              onClick={handleAddNumber}
              className="w-full md:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Número
            </Button>
          </div>

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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Celular</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Operação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {numbers.map((number) => (
                    <TableRow key={number.id}>
                      <TableCell className="font-medium">{number.numero}</TableCell>
                      <TableCell>{number.celular}</TableCell>
                      <TableCell>{number.status}</TableCell>
                      <TableCell>{number.operacao}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteNumber(number.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
