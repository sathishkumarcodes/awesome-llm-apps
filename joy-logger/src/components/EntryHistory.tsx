import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Sparkles, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

interface Entry {
  id: string;
  entry_date: string;
  entry_text: string;
  ai_reflection: string | null;
  created_at: string;
  tags: string[] | null;
  photo_url: string | null;
}

interface EntryHistoryProps {
  entries: Entry[];
  onUpdate: () => void;
}

export const EntryHistory = ({ entries, onUpdate }: EntryHistoryProps) => {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("journal_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Entry deleted");
      onUpdate();
    } catch (error: any) {
      console.error("Error deleting entry:", error);
      toast.error(error.message || "Failed to delete entry");
    } finally {
      setDeleteId(null);
    }
  };
  if (entries.length === 0) {
    return (
      <Card className="p-8 text-center bg-muted/30">
        <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No entries yet</h3>
        <p className="text-muted-foreground">Start your journey today!</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Moments You've Saved</h2>
      <ScrollArea className="h-[600px] pr-4">
        <div className="space-y-4">
          {entries.map((entry, index) => {
            // Rotating pastel gradients for each card
            const gradients = [
              "from-peach/20 to-blush/20",
              "from-primary-soft/20 to-amber-warm/20",
              "from-blush/20 to-ivory",
              "from-amber-warm/20 to-peach/20",
            ];
            const gradient = gradients[index % gradients.length];
            
            return (
              <Card
                key={entry.id}
                className={`p-6 bg-gradient-to-br ${gradient} border-0 shadow-soft hover:shadow-warm transition-all hover:scale-[1.02] animate-fade-up`}
                style={{ animationDelay: `${index * 0.05}s`, animationFillMode: "both" }}
              >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    {format(new Date(entry.entry_date), "MMMM d, yyyy")}
                  </div>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDeleteId(entry.id)}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                {entry.photo_url && (
                  <img 
                    src={entry.photo_url} 
                    alt="Journal moment" 
                    className="w-full h-48 object-cover rounded-lg"
                  />
                )}
                
                <p className="text-lg text-foreground font-medium">
                  {entry.entry_text}
                </p>

                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {entry.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {entry.ai_reflection && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-1" />
                      <p className="text-sm text-muted-foreground italic">
                        {entry.ai_reflection}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your journal entry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};