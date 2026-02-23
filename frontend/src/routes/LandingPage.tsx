import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Code2,
  Eye,
  Users,
  Share2,
  History,
  Download,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/stores/auth";

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

const SAMPLE_CODE = `@startuml
actor User
participant "Web App" as App
participant "API Server" as API
database "PostgreSQL" as DB

User -> App : Open diagram
App -> API : GET /documents/1
API -> DB : SELECT content
DB --> API : document data
API --> App : JSON response
App --> User : Render editor
@enduml`;

export function LandingPage() {
  const { user, isInitialized, initialize } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) initialize();
  }, [isInitialized, initialize]);

  const ctaPath = user ? "/dashboard" : "/register";
  const ctaLabel = user ? "Go to Dashboard" : "Get Started";

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="text-lg font-semibold">
            PlantUML IDE
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">Get Started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Create UML Diagrams{" "}
          <span className="text-muted-foreground">Together</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          A simple, powerful online IDE for PlantUML. Write diagram code with
          live preview, collaborate in real time, and share with anyone.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to={ctaPath}>
              {ctaLabel}
              <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/templates">View Templates</Link>
          </Button>
        </div>

        {/* Editor mock */}
        <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-lg border bg-background shadow-lg">
          <div className="flex items-center border-b px-4 py-2">
            <span className="text-xs text-muted-foreground">
              sequence-diagram.puml
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Code pane */}
            <div className="border-b bg-muted/30 p-4 text-left md:border-b-0 md:border-r">
              <pre className="overflow-x-auto text-[13px] leading-relaxed text-foreground/80">
                <code>{SAMPLE_CODE}</code>
              </pre>
            </div>
            {/* Preview pane */}
            <div className="flex items-center justify-center bg-muted/10 p-6">
              <div className="space-y-2 text-muted-foreground">
                <div className="mx-auto flex items-center justify-center rounded-md border border-dashed border-muted-foreground/30 px-6 py-10">
                  <div className="space-y-3 text-center">
                    <Eye className="mx-auto size-8 text-muted-foreground/50" />
                    <p className="text-sm">Live diagram preview</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:py-24">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Everything you need to diagram
          </h2>
          <p className="mt-3 text-muted-foreground">
            A complete toolkit for creating, sharing, and collaborating on
            PlantUML diagrams.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-lg border bg-background p-6 transition-colors hover:bg-muted/50"
            >
              <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-muted">
                <feature.icon className="size-5 text-foreground" />
              </div>
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center md:py-24">
        <h2 className="text-3xl font-bold tracking-tight">
          Ready to start diagramming?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Create your first diagram in seconds. No credit card required.
        </p>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link to={ctaPath}>
              {user ? "Go to Dashboard" : "Create Free Account"}
              <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        PlantUML IDE
      </footer>
    </div>
  );
}
