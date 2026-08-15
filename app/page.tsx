import Link from "next/link";
import { ArrowRight, Bot, Database, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const pillars = [
  { icon: Bot, title: "Local agents", text: "Run your first AI capability through Ollama on your own machine." },
  { icon: Database, title: "Structured foundation", text: "Workspaces and brand context have clear server-side boundaries." },
  { icon: ShieldCheck, title: "Built for control", text: "Secrets stay server-side and future automation can require approval." },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <Sparkles className="h-4 w-4" />
            </span>
            Flowyn
          </Link>
          <Link href="/sign-in" className="text-sm font-semibold text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
            Sign in
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-16 py-20 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              Local-first automation workspace
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-7xl dark:text-white">
              Business automation with a local AI core.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
              Flowyn brings workspace context, brand knowledge, controlled AI, agents, and durable workflows into one focused operating surface.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/sign-up">
                <Button size="lg">Create a workspace <ArrowRight className="h-4 w-4" /></Button>
              </Link>
              <Link href="/dashboard">
                <Button size="lg" variant="outline">Open dashboard</Button>
              </Link>
            </div>
          </div>

          <div className="relative rounded-[2rem] border border-slate-200 bg-white/80 p-5 shadow-2xl shadow-slate-300/20 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 dark:shadow-black/20">
            <div className="rounded-[1.5rem] bg-slate-950 p-6 text-white dark:bg-slate-800">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Flowyn runtime</p>
                  <p className="mt-2 text-lg font-semibold">Local readiness</p>
                </div>
                <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">ready locally</span>
              </div>
              <div className="space-y-4 py-6">
                {["Next.js application", "PostgreSQL data layer", "Redis runtime", "Ollama provider"].map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-sm">
                    <span className="text-slate-200">{item}</span>
                    <span className="text-xs font-medium text-slate-400">configured</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-violet-400/20 bg-violet-400/10 p-4 text-sm leading-6 text-violet-100">
                Start with a workspace and brand, then move from knowledge and AI experiments to governed agents and durable workflow runs.
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 py-8 md:grid-cols-3 dark:border-slate-800">
          {pillars.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <Icon className="mt-0.5 h-5 w-5 text-violet-600" />
              <div><p className="font-semibold text-slate-950 dark:text-white">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{text}</p></div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
