import { Link } from "react-router-dom";
import {
  Code2,
  Eye,
  Users,
  Share2,
  History,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const FEATURES = [
  {
    icon: Code2,
    title: "Code Editor",
    description:
      "Full-featured Monaco editor with PlantUML syntax highlighting, autocomplete, and error markers.",
  },
  {
    icon: Eye,
    title: "Live Preview",
    description:
      "See your diagrams render instantly as you type. Split-pane view keeps code and preview side by side.",
  },
  {
    icon: Users,
    title: "Real-Time Collaboration",
    description:
      "Edit diagrams together with live cursors, selections, and presence indicators for every collaborator.",
  },
  {
    icon: Share2,
    title: "Sharing & Permissions",
    description:
      "Share documents with public links or invite specific users as viewers or editors.",
  },
  {
    icon: History,
    title: "Version History",
    description:
      "Every change is versioned automatically. Browse, compare, and restore any previous version.",
  },
  {
    icon: Download,
    title: "Export Anywhere",
    description:
      "Download your diagrams as high-resolution PNG, SVG, or PlantUML source files.",
  },
] as const;

interface PitchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PitchModal({ open, onOpenChange }: PitchModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Unlock the full experience</DialogTitle>
          <DialogDescription>
            You're using the free editor. Create an account to save your work,
            collaborate in real time, and access version history.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 py-2">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="mb-2 flex size-8 items-center justify-center rounded-md bg-muted">
                <feature.icon className="size-4 text-foreground" />
              </div>
              <h3 className="text-sm font-semibold">{feature.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button asChild variant="outline">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/register">Create Free Account</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
