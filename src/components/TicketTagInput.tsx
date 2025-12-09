import { useState, KeyboardEvent, useRef } from "react";
import { X, GripVertical } from "lucide-react";
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent 
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TicketTagInputProps {
  tickets: string[];
  onChange: (tickets: string[]) => void;
}

interface SortableTicketProps {
  id: string;
  ticket: string;
  onRemove: () => void;
}

const SortableTicket = ({ id, ticket, onRemove }: SortableTicketProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="inline-flex items-center gap-1 bg-accent/20 border border-accent/50 text-foreground px-2 py-1 rounded-full text-sm group"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab hover:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-3 w-3" />
      </span>
      <span>{ticket}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};

export const TicketTagInput = ({ tickets, onChange }: TicketTagInputProps) => {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addTicket = () => {
    const newTicket = inputValue.trim();
    if (newTicket && !tickets.includes(newTicket)) {
      onChange([...tickets, newTicket]);
    }
    setInputValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === " ") {
      e.preventDefault();
      addTicket();
    } else if (e.key === "Backspace" && !inputValue && tickets.length > 0) {
      onChange(tickets.slice(0, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      addTicket();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tickets.indexOf(active.id as string);
      const newIndex = tickets.indexOf(over.id as string);
      onChange(arrayMove(tickets, oldIndex, newIndex));
    }
  };

  const removeTicket = (index: number) => {
    onChange(tickets.filter((_, i) => i !== index));
  };

  return (
    <div 
      className="min-h-[42px] w-full rounded-md border border-border bg-input px-3 py-2 cursor-text flex flex-wrap gap-2 items-center"
      onClick={() => inputRef.current?.focus()}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={tickets} strategy={horizontalListSortingStrategy}>
          {tickets.map((ticket, index) => (
            <SortableTicket
              key={ticket}
              id={ticket}
              ticket={ticket}
              onRemove={() => removeTicket(index)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tickets.length === 0 ? "Ex: R$24,99 (espaço para adicionar)" : ""}
        className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
      />
    </div>
  );
};
