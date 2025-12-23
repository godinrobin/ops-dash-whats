"use client";

import { useState, useEffect, useMemo, ReactNode } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { Download, ChevronDown, X, ChevronUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T, index: number) => ReactNode;
  sortable?: boolean;
  className?: string;
}

interface AnimatedTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  title?: string;
  className?: string;
  enableAnimations?: boolean;
  selectable?: boolean;
  onSelectionChange?: (selectedIds: string[]) => void;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  showExport?: boolean;
  exportFileName?: string;
  itemsPerPage?: number;
}

export function AnimatedTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  title,
  className = "",
  enableAnimations = true,
  selectable = false,
  onSelectionChange,
  onRowClick,
  emptyMessage = "Nenhum dado encontrado",
  showExport = false,
  exportFileName = "export",
  itemsPerPage = 10,
}: AnimatedTableProps<T>) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleItemSelect = (itemId: string) => {
    setSelectedItems(prev => {
      const newSelection = prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId];
      onSelectionChange?.(newSelection);
      return newSelection;
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.length === paginatedData.length) {
      setSelectedItems([]);
      onSelectionChange?.([]);
    } else {
      const allIds = paginatedData.map(item => keyExtractor(item));
      setSelectedItems(allIds);
      onSelectionChange?.(allIds);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
    setCurrentPage(1);
  };

  const sortedData = useMemo(() => {
    if (!sortField) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortField, sortOrder]);

  const paginatedData = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIdx, startIdx + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);

  const exportToCSV = () => {
    const headers = columns.map(col => col.header);
    const rows = sortedData.map(item =>
      columns.map(col => {
        const value = item[col.key as keyof T];
        return typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      })
    );

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${exportFileName}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportToJSON = () => {
    const jsonContent = JSON.stringify(sortedData, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${exportFileName}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const shouldAnimate = enableAnimations && !shouldReduceMotion;

  const rowVariants = {
    hidden: { 
      opacity: 0, 
      y: 20,
      scale: 0.98,
      filter: "blur(4px)" 
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: {
        type: "spring" as const,
        stiffness: 400,
        damping: 25,
        mass: 0.7,
      },
    },
    exit: {
      opacity: 0,
      y: -10,
      transition: { duration: 0.2 }
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    }
    return sortOrder === "asc" ? (
      <ChevronUp className="ml-2 h-4 w-4" />
    ) : (
      <ChevronDown className="ml-2 h-4 w-4" />
    );
  };

  if (data.length === 0) {
    return (
      <div className={cn("w-full p-8 text-center text-muted-foreground", className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Header */}
      {(title || showExport) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="text-lg font-semibold text-foreground">{title}</h3>}
          
          {showExport && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-3 py-1.5 bg-background border border-border/50 text-foreground text-sm hover:bg-muted/30 transition-colors flex items-center gap-2 rounded-md"
              >
                <Download className="w-4 h-4" />
                Exportar
                <ChevronDown className="w-4 h-4" />
              </button>
              
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 mt-2 w-40 bg-popover border border-border rounded-lg shadow-xl z-20 overflow-hidden">
                    <button
                      onClick={() => {
                        exportToCSV();
                        setShowExportMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                    >
                      CSV
                    </button>
                    <button
                      onClick={() => {
                        exportToJSON();
                        setShowExportMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors border-t border-border/30"
                    >
                      JSON
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="border border-border/30 rounded-lg overflow-hidden bg-card/30 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30 border-b border-border/30">
              <tr>
                {selectable && (
                  <th className="py-3 px-4 text-left">
                    <input
                      type="checkbox"
                      checked={selectedItems.length > 0 && selectedItems.length === paginatedData.length}
                      onChange={handleSelectAll}
                      className="rounded border-border"
                    />
                  </th>
                )}
                {columns.map((column) => (
                  <th
                    key={String(column.key)}
                    className={cn(
                      "py-3 px-4 text-left text-sm font-medium text-muted-foreground",
                      column.sortable && "cursor-pointer hover:bg-muted/50",
                      column.className
                    )}
                    onClick={() => column.sortable && handleSort(String(column.key))}
                  >
                    <div className="flex items-center">
                      {column.header}
                      {column.sortable && <SortIcon field={String(column.key)} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {paginatedData.map((item, index) => {
                  const itemId = keyExtractor(item);
                  return (
                    <motion.tr
                      key={itemId}
                      variants={shouldAnimate ? rowVariants : undefined}
                      initial={shouldAnimate ? "hidden" : undefined}
                      animate={shouldAnimate ? "visible" : undefined}
                      exit={shouldAnimate ? "exit" : undefined}
                      className={cn(
                        "border-b border-border/20 hover:bg-muted/20 transition-colors group",
                        onRowClick && "cursor-pointer"
                      )}
                      onClick={() => onRowClick?.(item)}
                      style={shouldAnimate ? { animationDelay: `${index * 0.04}s` } : undefined}
                    >
                      {selectable && (
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(itemId)}
                            onChange={() => handleItemSelect(itemId)}
                            className="rounded border-border"
                          />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td
                          key={String(column.key)}
                          className={cn("py-3 px-4 text-sm text-foreground", column.className)}
                        >
                          {column.render
                            ? column.render(item, index)
                            : String(item[column.key as keyof T] ?? "")}
                        </td>
                      ))}
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <span className="text-xs text-muted-foreground">
            Página {currentPage} de {totalPages} • {sortedData.length} itens
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 bg-background border border-border/50 text-foreground text-xs hover:bg-muted/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-md"
            >
              Anterior
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 bg-background border border-border/50 text-foreground text-xs hover:bg-muted/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-md"
            >
              Próximo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
